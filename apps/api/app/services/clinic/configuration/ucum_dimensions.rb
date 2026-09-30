require "nokogiri"
require "digest"

module Clinic
  module Configuration
    # UCUM 2.2 linear-unit dimension algebra only; never transforms a result value.
    # Special/non-ratio and arbitrary units deliberately fail closed.
    class UcumDimensions
      class Invalid < ArgumentError; end
      class Unsupported < Invalid; end
      DEFINITIONS_SHA256 = "dfccea1b5dc284245ebae97edd1dc03c45864da4e87df55bc9851797b4fd0b61".freeze
      BASIS = %w[m s g rad K C cd].freeze
      NS = { "u" => "http://unitsofmeasure.org/ucum-essence" }.freeze

      def self.vector(code)
        new.reduce(code)
      end

      def initialize
        bytes = File.binread(Rails.root.join("vendor/ucum/ucum-essence.xml"))
        raise Invalid, "Pinned UCUM definitions are unavailable." unless Digest::SHA256.hexdigest(bytes) == DEFINITIONS_SHA256
        root = Nokogiri::XML(bytes) { |config| config.strict.nonet }.root
        @atoms = root.xpath("u:base-unit | u:unit", NS).index_by { |node| node["Code"] }
        @prefixes = root.xpath("u:prefix", NS).map { |node| node["Code"] }.sort_by { |prefix| -prefix.length }
        @cache = {}
      end

      def reduce(code, resolving = [])
        unless code.is_a?(String) && code.bytesize.between?(1, 240) && code.match?(/\A[\x21-\x7e]+\z/)
          raise Invalid, "A case-sensitive UCUM expression without whitespace is required."
        end
        Parser.new(self, code, resolving).parse
      end

      def atom(token, resolving)
        return {} if token.match?(/\A\d+\z/) && token.to_i.positive?
        # UCUM lexical rule: longest prefix whose remainder is a metric atom.
        prefixed = @prefixes.filter_map do |prefix|
          next unless token.start_with?(prefix)
          candidate = @atoms[token.delete_prefix(prefix)]
          candidate if candidate && (candidate.name == "base-unit" || candidate["isMetric"] == "yes")
        end.first
        node = prefixed || @atoms[token]
        raise Invalid, "Unknown UCUM atom #{token}." unless node
        code = node["Code"]
        return @cache[code] if @cache.key?(code)
        raise Invalid, "Recursive UCUM definition." if resolving.include?(code) || resolving.length >= 32
        if node["isSpecial"] == "yes" || node.at_xpath("u:property", NS)&.text == "arbitrary"
          raise Unsupported, "Special/non-ratio or arbitrary UCUM units require a separate supported validator."
        end
        value = if node.name == "base-unit"
          { code => 1 }
        else
          reduce(node.at_xpath("u:value", NS)["Unit"], resolving + [code])
        end
        @cache[code] = value.freeze
      end

      class Parser
        def initialize(engine, code, resolving)
          @engine, @code, @resolving, @position = engine, code, resolving, 0
        end

        def parse
          result = term(0)
          raise Invalid, "Unexpected UCUM syntax." unless @position == @code.length
          result.sort.to_h
        end

        def term(depth)
          raise Invalid, "UCUM nesting limit exceeded." if depth > 16
          reciprocal = peek == "/"
          @position += 1 if reciprocal
          result = component(depth)
          result = scale(result, -1) if reciprocal
          while %w[. /].include?(peek)
            operator = peek
            @position += 1
            result = combine(result, component(depth), operator == "/" ? -1 : 1)
          end
          result
        end

        def component(depth)
          if peek == "("
            @position += 1
            result = term(depth + 1)
            raise Invalid, "Unclosed UCUM term." unless peek == ")"
            @position += 1
            return result # UCUM 2.2 does not permit exponents on parentheses.
          end
          if peek == "{"
            annotation
            return {}
          end
          start = @position
          bracket = false
          while (character = peek)
            if character == "["
              raise Invalid, "Nested UCUM atom brackets." if bracket
              bracket = true
            elsif character == "]"
              raise Invalid, "Unmatched UCUM atom bracket." unless bracket
              bracket = false
            elsif !bracket && ("./(){}+-=".include?(character) || character == '"')
              break
            end
            @position += 1
          end
          raise Invalid, "Unclosed UCUM atom bracket." if bracket
          token = @code[start...@position]
          raise Invalid, "A UCUM component is required." if token.empty?
          exponent = 1
          suffix = nil
          if token.match?(/\A\d+\z/)
            result = @engine.atom(token, @resolving)
          else
            suffix = token.match(/(\d+)\z/)
            if suffix
              exponent = Integer(suffix[1], 10)
              token = token[0...-suffix[1].length]
            end
            result = @engine.atom(token, @resolving)
          end
          if %w[+ -].include?(peek)
            raise Invalid, "Duplicate UCUM exponent." if suffix
            sign = peek == "-" ? -1 : 1
            @position += 1
            digits = @code[@position..].match(/\A\d+/)&.[](0)
            raise Invalid, "UCUM exponent digits are required." unless digits
            @position += digits.length
            exponent = sign * Integer(digits, 10)
          end
          raise Invalid, "UCUM exponent exceeds the supported bound." if exponent.abs > 1000
          result = scale(result, exponent)
          annotation if peek == "{"
          result
        end

        def annotation
          @position += 1
          while peek && peek != "}"
            raise Invalid, "Nested UCUM annotation." if peek == "{"
            @position += 1
          end
          raise Invalid, "Unclosed UCUM annotation." unless peek == "}"
          @position += 1
        end

        def peek = @code[@position]
        def scale(vector, exponent) = vector.transform_values { |power| power * exponent }.reject { |_unit, power| power.zero? }
        def combine(left, right, sign)
          result = left.dup
          right.each { |unit, power| result[unit] = result.fetch(unit, 0) + sign * power }
          result.reject { |_unit, power| power.zero? }
        end
      end
    end
  end
end
