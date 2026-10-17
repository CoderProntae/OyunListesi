import type { Page } from "@playwright/test";
// Shared by the dev-only interface audits (ui-audit, overlay-audit).
export type Issue = { where: string; kind: string; detail: string };
export async function inspect(page: Page, where: string, issues: Issue[]) {
  const found: Issue[] = await page.evaluate((where) => {
    const list: { where: string; kind: string; detail: string }[] = [];
    const W = innerWidth,
      H = innerHeight;
    const name = (el: Element) => {
      const h = el as HTMLElement;
      const label =
        h.getAttribute("aria-label") || h.innerText?.trim().slice(0, 40) || "";
      return `${el.tagName.toLowerCase()}.${String(h.className || "")
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .join(".")} «${label}»`;
    };
    const visible = (el: Element) => {
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return false;
      const s = getComputedStyle(el);
      return (
        s.visibility !== "hidden" && s.display !== "none" && Number(s.opacity) > 0.05
      );
    };
    const clipped = (el: Element) => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (["hidden", "auto", "scroll", "clip"].includes(o.overflowX)) {
          const pr = p.getBoundingClientRect();
          const r = el.getBoundingClientRect();
          if (r.right > pr.right + 1 || r.left < pr.left - 1) return true;
        }
      }
      return false;
    };
    if (document.documentElement.scrollWidth > W + 1)
      list.push({
        where,
        kind: "page-wider-than-window",
        detail: `${document.documentElement.scrollWidth} > ${W}`,
      });
    const controls = [
      ...document.querySelectorAll(
        "button, input, select, textarea, a[href], [role=tab], [role=menuitem]",
      ),
    ].filter(visible);
    for (const el of controls) {
      const r = el.getBoundingClientRect();
      if ((r.right > W + 1 || r.bottom > H + 1 || r.left < -1) && !clipped(el)) {
        // Only report controls that are not inside a scroll area.
        let scroller = false;
        for (let p = el.parentElement; p; p = p.parentElement) {
          const o = getComputedStyle(p);
          if (
            ["auto", "scroll"].includes(o.overflowY) ||
            ["auto", "scroll"].includes(o.overflowX)
          )
            scroller = true;
        }
        if (!scroller)
          list.push({
            where,
            kind: "control-outside-window",
            detail: name(el) + ` r=${Math.round(r.right)} b=${Math.round(r.bottom)}`,
          });
      }
    }
    // Text spilling out of its box.
    for (const el of document.querySelectorAll("body *")) {
      if (!visible(el)) continue;
      const h = el as HTMLElement;
      const own = [...h.childNodes].some(
        (n) => n.nodeType === 3 && n.textContent!.trim().length > 1,
      );
      if (!own) continue;
      const s = getComputedStyle(h);
      if (s.overflowX !== "visible" || s.textOverflow === "ellipsis") continue;
      if (
        h.scrollWidth > h.clientWidth + 3 &&
        h.clientWidth > 0 &&
        !["SVG", "svg"].includes(h.tagName)
      ) {
        if (clipped(h)) continue;
        list.push({
          where,
          kind: "text-overflows-box",
          detail: name(el) + ` ${h.scrollWidth}>${h.clientWidth}`,
        });
      }
    }
    // Controls on top of each other (only controls that can really be hit:
    // the one under their own centre; a modal's background does not count).
    const hittable = controls.filter((el) => {
      const r = el.getBoundingClientRect();
      const x = Math.min(W - 1, Math.max(0, r.left + r.width / 2)),
        y = Math.min(H - 1, Math.max(0, r.top + r.height / 2));
      const top = document.elementFromPoint(x, y);
      return !!top && (el === top || el.contains(top) || top.contains(el));
    });
    // The part of a control that can be seen: clipped by scrolling ancestors.
    const seen = (el: Element) => {
      const r = el.getBoundingClientRect();
      let l = r.left,
        t = r.top,
        rr = r.right,
        b = r.bottom;
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p);
        if (o.overflowX !== "visible" || o.overflowY !== "visible") {
          const q = p.getBoundingClientRect();
          l = Math.max(l, q.left);
          t = Math.max(t, q.top);
          rr = Math.min(rr, q.right);
          b = Math.min(b, q.bottom);
        }
      }
      return { left: l, top: t, right: rr, bottom: b };
    };
    const boxes = hittable.map((el) => ({ el, r: seen(el) }));
    for (let i = 0; i < boxes.length; i++)
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i],
          b = boxes[j];
        if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
        const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left),
          y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
        if (x > 3 && y > 3) {
          // The top-most element at the overlap centre decides if it matters.
          const cx = Math.max(a.r.left, b.r.left) + x / 2,
            cy = Math.max(a.r.top, b.r.top) + y / 2;
          const top = document.elementFromPoint(cx, cy);
          if (
            top &&
            (a.el.contains(top) || b.el.contains(top)) &&
            !(a.el.closest("[aria-hidden=true]") || b.el.closest("[aria-hidden=true]"))
          )
            list.push({
              where,
              kind: "controls-overlap",
              detail: `${name(a.el)} × ${name(b.el)} (${Math.round(x)}×${Math.round(y)})`,
            });
        }
      }
    return list;
  }, where);
  issues.push(...found);
}
