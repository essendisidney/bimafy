"use client";

import Link from "next/link";
import { platformStore, usePlatform } from "@/lib/store";
import { Badge, Button, Card, PageHeader, Stat, Table } from "@/components/ui";

export default function NotificationsPage() {
  const { notifications } = usePlatform();
  const unread = notifications.filter((n) => n.status === "sent" || n.status === "queued").length;

  return (
    <div>
      <PageHeader
        eyebrow="Notifications"
        title="SMS, email, WhatsApp, push"
        description="Premium due, claim updates, payment received, channel intake — posted by the event ledger."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              notifications.forEach((n) => {
                if (n.status === "sent" || n.status === "queued") {
                  platformStore.updateNotification(n.id, { status: "read" });
                }
              });
            }}
          >
            Mark all read
          </Button>
        }
      />
      <div className="mb-4 grid gap-3 md:grid-cols-3">
        <Stat label="Total" value={String(notifications.length)} />
        <Stat label="Unread / queued" value={String(unread)} />
        <Stat
          label="Failed"
          value={String(notifications.filter((n) => n.status === "failed").length)}
        />
      </div>
      <Card className="p-2">
        <Table headers={["Channel", "Title", "Message", "Status", "When", ""]}>
          {notifications.map((n) => (
            <tr key={n.id} className="border-b border-line/70">
              <td className="px-3 py-3 capitalize">{n.channel}</td>
              <td className="px-3 py-3 font-medium">{n.title}</td>
              <td className="px-3 py-3 text-mute">{n.body}</td>
              <td className="px-3 py-3">
                <Badge status={n.status} />
              </td>
              <td className="px-3 py-3 text-xs text-mute">
                {n.createdAt.slice(0, 16).replace("T", " ")}
              </td>
              <td className="px-3 py-3">
                <div className="flex flex-wrap gap-1">
                  {n.href ? (
                    <Link
                      href={n.href}
                      className="inline-flex items-center rounded-xl px-2 py-1 text-xs text-ink hover:bg-sand"
                      onClick={() => platformStore.updateNotification(n.id, { status: "read" })}
                    >
                      Open
                    </Link>
                  ) : null}
                  {n.status !== "read" ? (
                    <Button
                      variant="ghost"
                      className="!px-2 !py-1 text-xs"
                      onClick={() => platformStore.updateNotification(n.id, { status: "read" })}
                    >
                      Read
                    </Button>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </Table>
        {notifications.length === 0 ? (
          <p className="p-6 text-sm text-mute">No notifications yet.</p>
        ) : null}
      </Card>
      <p className="mt-3 text-xs text-mute">
        Tip: claim / payment / endorsement events include deep links — use{" "}
        <Link className="text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal" href="/app/claims">
          Claims
        </Link>{" "}
        or Open above.
      </p>
    </div>
  );
}
