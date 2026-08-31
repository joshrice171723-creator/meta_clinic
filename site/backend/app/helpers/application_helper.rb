module ApplicationHelper
  def progress_badge(status)
    tag.span(status.tr("_", " ").capitalize, class: "status-badge status-#{status}")
  end

  def site_origin
    ENV.fetch("APP_SITE_ORIGIN", "http://localhost:3000").delete_suffix("/")
  end
end
