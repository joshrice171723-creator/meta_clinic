require "io/console"

namespace :members do
  desc "Provision a member interactively; no plaintext passwords in logs or shell history"
  task create: :environment do
    abort "Run in an interactive terminal." unless $stdin.tty?
    print "Email: "
    email = $stdin.gets.to_s.strip
    print "Administrator? [y/N]: "
    admin = $stdin.gets.to_s.strip.downcase == "y"
    print "Password (at least 12 characters): "
    password = $stdin.noecho(&:gets).to_s.chomp
    print "\nConfirm password: "
    confirmation = $stdin.noecho(&:gets).to_s.chomp
    puts
    user = User.new(email_address: email, password: password, password_confirmation: confirmation, admin: admin)
    if user.save
      Paperwork.assign_demo!(user)
      puts "Account created (id #{user.id}). No invitation email was sent."
    else
      abort user.errors.full_messages.to_sentence
    end
  end

  desc "Reset a password interactively and revoke all member sessions"
  task reset_password: :environment do
    abort "Run in an interactive terminal." unless $stdin.tty?
    print "Email: "
    user = User.find_by!(email_address: $stdin.gets.to_s.strip.downcase)
    print "New password (at least 12 characters): "
    password = $stdin.noecho(&:gets).to_s.chomp
    print "\nConfirm password: "
    confirmation = $stdin.noecho(&:gets).to_s.chomp
    puts
    user.update!(password: password, password_confirmation: confirmation)
    puts "Password reset; existing sessions revoked."
  end

  desc "Remove expired session records"
  task prune_sessions: :environment do
    puts "Removed #{MemberSession.where('expires_at <= ?', Time.current).delete_all} expired sessions."
  end
end
