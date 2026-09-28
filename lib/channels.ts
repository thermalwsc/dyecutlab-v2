/* =========================================================
   NOTIFICATION CHANNELS — the shared result contract
=========================================================

   Every outbound notification resolves with this shape instead of
   throwing, so a provider failure can never block the user-facing
   success state of a form (sign-up saved, quote request recorded).

   Providers are split, one job each:
   - lib/brevo.ts     → EMAIL only (confirmation + staff alerts)
   - lib/sendblue.ts  → SMS / iMessage only (staff quote alert)

   Both report through `ChannelResult`, which is why the type lives
   here rather than in either provider.
*/

export type ChannelStatus = "sent" | "skipped" | "failed";

export type ChannelResult = {
  status: ChannelStatus;
  detail?: string;
};

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
