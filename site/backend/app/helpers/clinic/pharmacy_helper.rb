module Clinic::PharmacyHelper
  def pharmacy_section
    @view || "inventory"
  end

  def pharmacy_icon(name)
    paths = {
      "dashboard" => '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
      "inventory" => '<path d="m3 7 9-4 9 4v10l-9 4-9-4V7Zm0 0 9 4 9-4M12 11v10M7 5l10 4"/>',
      "movements" => '<path d="M3 12h4l3-8 4 16 3-8h4"/>',
      "alerts" => '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
      "suppliers" => '<path d="M3 5h11v12H3V5Zm11 4h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="18" cy="18" r="2"/>',
      "plus" => '<path d="M12 5v14M5 12h14"/>',
      "arrow" => '<path d="M5 12h14m-5-5 5 5-5 5"/>',
      "search" => '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
      "clinic" => '<path d="M4 21V5h16v16M9 21v-5h6v5M9 9h6M12 6v6"/>',
      "back" => '<path d="M19 12H5m5-5-5 5 5 5"/>'
    }
    # Only fixed, locally authored paths are marked safe; never user/catalog data.
    content_tag(:svg, paths.fetch(name, paths.fetch("inventory")).html_safe,
      viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", "stroke-width": 1.6,
      "stroke-linecap": "round", "stroke-linejoin": "round", class: "rx-icon", "aria-hidden": true)
  end

  def pharmacy_status(product)
    return [ "Inactive", "neutral" ] unless product.active?
    return [ "Out of stock", "danger" ] if product.available_quantity.zero?
    return [ "Low stock", "warning" ] if product.low_stock?
    return [ "Expiring soon", "warning" ] if product.batches.any?(&:expiring?)
    [ "In stock", "positive" ]
  end
end
