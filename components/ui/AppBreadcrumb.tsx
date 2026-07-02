import { Fragment } from "react";
import Link from "next/link";

import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";

export type Crumb = {
  label: string;
  /** Omit on the last (current) crumb. */
  href?: string;
};

/*
  App-wide breadcrumb. Every page builds its own trail; the LAST crumb is the
  current page and is rendered without a link (BreadcrumbPage sets
  aria-current="page"). Dynamic segments should be resolved to real names by the
  page — pass "Jane Doe", never "[id]".

  Small, muted, one line — the current page is the only emphasised crumb.

  `tone="onWater"` recolours the trail for the deep-water header band: links and
  separators go translucent white, the current page full white. Used by
  PageHeader's water variant; the default tone is unchanged everywhere else.
*/
export function AppBreadcrumb({
  trail,
  tone = "default",
}: {
  trail: Crumb[];
  tone?: "default" | "onWater";
}) {
  return (
    <Breadcrumb
      className={
        tone === "onWater"
          ? "[&_a]:!text-white/75 [&_a:hover]:!text-white [&_li]:!text-white/60 [&_ol]:!text-white/60 [&_svg]:!text-white/45 [&_[aria-current='page']]:!text-white"
          : undefined
      }
    >
      <BreadcrumbList>
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <BreadcrumbItem>
                {isLast ? (
                  // Only the current page carries aria-current and emphasis.
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : crumb.href ? (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
                ) : (
                  // A middle crumb with no page of its own (e.g. a nav group):
                  // plain muted text, neither a link nor the current page.
                  <span>{crumb.label}</span>
                )}
              </BreadcrumbItem>
              {!isLast && <BreadcrumbSeparator />}
            </Fragment>
          );
        })}
      </BreadcrumbList>
    </Breadcrumb>
  );
}
