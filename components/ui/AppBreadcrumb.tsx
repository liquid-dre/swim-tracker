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
*/
export function AppBreadcrumb({ trail }: { trail: Crumb[] }) {
  return (
    <Breadcrumb>
      <BreadcrumbList>
        {trail.map((crumb, i) => {
          const isLast = i === trail.length - 1;
          return (
            <Fragment key={`${crumb.label}-${i}`}>
              <BreadcrumbItem>
                {isLast || !crumb.href ? (
                  <BreadcrumbPage>{crumb.label}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink asChild>
                    <Link href={crumb.href}>{crumb.label}</Link>
                  </BreadcrumbLink>
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
