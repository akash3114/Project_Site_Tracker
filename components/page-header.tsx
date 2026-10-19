import type { ReactNode } from "react";

/**
 * Shared page heading. Every route opens with the same overline / title /
 * subtitle block so the app reads consistently; the left accent rule and the
 * hairline divider come from `.cockpit-title-copy` / `.cockpit-title-row`.
 */
export function PageHeader({
  overline,
  title,
  subtitle,
  action,
}: {
  overline: string;
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="cockpit-title-row">
      <div className="cockpit-title-copy">
        <p className="cockpit-overline">{overline}</p>
        <h1>{title}</h1>
        {subtitle ? <p className="cockpit-subtitle">{subtitle}</p> : null}
      </div>
      {action ? <div className="cockpit-title-actions">{action}</div> : null}
    </div>
  );
}
