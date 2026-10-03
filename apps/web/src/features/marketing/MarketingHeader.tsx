import { useId, useState } from "react";
import {
  Button,
  Drawer,
  IconButton,
  Menu,
  MenuItem,
  useMediaQuery,
} from "@mui/material";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import ExpandMoreRoundedIcon from "@mui/icons-material/ExpandMoreRounded";
import MenuRoundedIcon from "@mui/icons-material/MenuRounded";
import { clinicTypeLabels } from "./ClinicTypePages";
import { featureHref, marketingFeatures } from "./features";
import "./marketingHeader.css";

type Destination = { label: string; href: string };
type NavigationGroup = { label: string; links: Destination[] };

const groups: NavigationGroup[] = [
  {
    label: "Specialties",
    links: [
      ...Object.entries(clinicTypeLabels).map(([slug, label]) => ({
        label,
        href: `/meta-clinic/${slug}`,
      })),
    ],
  },
  {
    label: "Features",
    links: marketingFeatures.map((feature) => ({
      label: feature.label,
      href: featureHref(feature),
    })),
  },
];

const directLinks: Destination[] = [
  { label: "Platform", href: "/meta-clinic/platform" },
  { label: "AI", href: "/meta-clinic/ai" },
  { label: "Resources", href: "/meta-clinic/resources" },
  { label: "Security", href: "/meta-clinic/security" },
  { label: "Pricing", href: "/meta-clinic/pricing" },
];

export function MarketingHeader({
  activeClinicType,
}: {
  activeClinicType?: string;
}) {
  const id = useId();
  const desktop = useMediaQuery("(min-width: 1200px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menu, setMenu] = useState<{
    group: NavigationGroup;
    anchor: HTMLElement;
  } | null>(null);
  const pathname = window.location.pathname.replace(/\/$/, "") || "/";
  const isCurrent = (href: string) => pathname === href;
  const inGroup = (group: NavigationGroup) =>
    group.links.some((link) =>
      isCurrent(link.href) || pathname.startsWith(`${link.href}/`),
    ) ||
    (group.label === "Specialties" && Boolean(activeClinicType));

  const renderLink = (link: Destination, className: string) => (
    <Button
      key={link.href}
      href={link.href}
      className={className}
      aria-current={isCurrent(link.href) ? "page" : undefined}
      onClick={() => setDrawerOpen(false)}
    >
      {link.label}
    </Button>
  );

  return (
    <header className="marketing-header">
      <div className="marketing-header__inner">
        <a
          className="marketing-header__brand"
          href="/meta-clinic"
          aria-label="Meta Clinic home"
          aria-current={isCurrent("/meta-clinic") ? "page" : undefined}
        >
          <span className="marketing-header__mark" aria-hidden="true">
            <span />
            <span />
          </span>
          <span>Meta Clinic</span>
        </a>
        {desktop ? (
          <>
            <nav className="marketing-header__nav" aria-label="Main navigation">
              {renderLink(directLinks[0], "marketing-header__link")}
              {groups.map((group) => (
                <div
                  className="marketing-header__group"
                  data-active={inGroup(group) || undefined}
                  key={group.label}
                >
                  <Button
                    id={`${id}-${group.label}-trigger`}
                    className="marketing-header__link"
                    aria-haspopup="menu"
                    aria-controls={menu?.group === group ? `${id}-menu` : undefined}
                    aria-expanded={menu?.group === group}
                    onClick={(event) =>
                      setMenu({ group, anchor: event.currentTarget })
                    }
                    onKeyDown={(event) => {
                      if (event.key === "ArrowDown") {
                        event.preventDefault();
                        setMenu({ group, anchor: event.currentTarget });
                      }
                    }}
                  >
                    {group.label}
                    <ExpandMoreRoundedIcon fontSize="small" />
                  </Button>
                </div>
              ))}
              {directLinks.slice(1).map((link) => renderLink(link, "marketing-header__link"))}
            </nav>
            <div className="marketing-header__actions">
              {renderLink({ label: "Sign in", href: "/login" }, "marketing-header__signin")}
              <Button href="/meta-clinic/book-demo" variant="contained" disableElevation className="marketing-header__demo">
                Book a demo
              </Button>
            </div>
          </>
        ) : (
          <div className="marketing-header__actions">
            <Button href="/meta-clinic/book-demo" variant="contained" disableElevation className="marketing-header__demo">
              Book a demo
            </Button>
            <IconButton
              className="marketing-header__toggle"
              aria-label="Open navigation"
              aria-controls={drawerOpen ? `${id}-navigation` : undefined}
              aria-expanded={drawerOpen}
              onClick={() => setDrawerOpen(true)}
            >
              <MenuRoundedIcon />
            </IconButton>
          </div>
        )}
      </div>
      <Menu
        id={`${id}-menu`}
        open={desktop && Boolean(menu)}
        anchorEl={menu?.anchor}
        onClose={() => setMenu(null)}
        anchorOrigin={{ vertical: "bottom", horizontal: "left" }}
        transformOrigin={{ vertical: "top", horizontal: "left" }}
        slotProps={{
          paper: { className: "marketing-header__menu" },
          list: { "aria-labelledby": menu ? `${id}-${menu.group.label}-trigger` : undefined },
        }}
      >
        {menu?.group.links.map((link) => (
          <MenuItem
            component="a"
            href={link.href}
            key={link.href}
            selected={isCurrent(link.href)}
            aria-current={isCurrent(link.href) ? "page" : undefined}
            onClick={() => setMenu(null)}
          >
            {link.label}
          </MenuItem>
        ))}
      </Menu>
      <Drawer
        anchor="right"
        open={!desktop && drawerOpen}
        onClose={() => setDrawerOpen(false)}
        slotProps={{ paper: { className: "marketing-header__drawer" } }}
      >
        <div className="marketing-header__drawer-top">
          <span>Explore Meta Clinic</span>
          <IconButton aria-label="Close navigation" onClick={() => setDrawerOpen(false)}>
            <CloseRoundedIcon />
          </IconButton>
        </div>
        <nav id={`${id}-navigation`} aria-label="Main navigation" className="marketing-header__drawer-nav">
          {renderLink({ label: "Home", href: "/meta-clinic" }, "marketing-header__drawer-link")}
          <div className="marketing-header__drawer-direct">
            {directLinks.map((link) => renderLink(link, "marketing-header__drawer-link"))}
            {renderLink({ label: "Sign in", href: "/login" }, "marketing-header__drawer-link")}
            <Button href="/meta-clinic/book-demo" variant="contained" disableElevation className="marketing-header__demo" onClick={() => setDrawerOpen(false)}>
              Book a demo
            </Button>
          </div>
          {groups.map((group) => (
            <section key={group.label} aria-labelledby={`${id}-${group.label}-heading`}>
              <h2 id={`${id}-${group.label}-heading`}>{group.label}</h2>
              {group.links.map((link) => renderLink(link, "marketing-header__drawer-link"))}
            </section>
          ))}
        </nav>
      </Drawer>
    </header>
  );
}
