import { useEffect } from "react";

/** Public product metadata. Indexing stays held until a separate release decision. */
export function useMarketingMetadata({
  title,
  description,
  path,
}: {
  title: string;
  description: string;
  path: string;
}) {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = title;
    const restore: (() => void)[] = [];
    for (const [selector, tag, attributes] of [
      [
        'meta[name="description"]',
        "meta",
        { name: "description", content: description },
      ],
      [
        'meta[name="robots"]',
        "meta",
        { name: "robots", content: "noindex,follow" },
      ],
      [
        'meta[property="og:title"]',
        "meta",
        { property: "og:title", content: title },
      ],
      [
        'meta[property="og:description"]',
        "meta",
        { property: "og:description", content: description },
      ],
      [
        'link[rel="canonical"]',
        "link",
        { rel: "canonical", href: new URL(path, window.location.origin).href },
      ],
    ] as const) {
      const existing = document.head.querySelector(selector);
      const node = existing ?? document.createElement(tag);
      const before = node.cloneNode(true) as Element;
      for (const [key, value] of Object.entries(attributes))
        node.setAttribute(key, value);
      if (!existing) document.head.appendChild(node);
      restore.push(() => {
        if (!existing) node.remove();
        else {
          for (const attribute of [...node.attributes])
            node.removeAttribute(attribute.name);
          for (const attribute of [...before.attributes])
            node.setAttribute(attribute.name, attribute.value);
        }
      });
    }
    return () => {
      document.title = previousTitle;
      restore.forEach((action) => action());
    };
  }, [title, description, path]);
}
