import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Settings",
};

export default function SettingsPage() {
  return (
    <main className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold text-foreground mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Profile section */}
        <section className="bg-card border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Profile</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">
                Display name
              </label>
              <input
                type="text"
                placeholder="Your name"
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>
            <div className="space-y-1">
              <label className="block text-sm font-medium text-foreground">
                Email
              </label>
              <input
                type="email"
                disabled
                className="w-full rounded-md border border-input bg-muted px-3 py-2 text-sm text-muted-foreground cursor-not-allowed"
              />
            </div>
          </div>

          {/* Member color picker */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-foreground">
              Profile color
            </label>
            <div className="flex gap-3 flex-wrap">
              {[
                "#EF4444",
                "#F97316",
                "#EAB308",
                "#22C55E",
                "#3B82F6",
                "#8B5CF6",
                "#EC4899",
                "#14B8A6",
              ].map((color) => (
                <button
                  key={color}
                  type="button"
                  className="h-8 w-8 rounded-full border-2 border-transparent hover:scale-110 transition-transform focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
                  style={{ backgroundColor: color }}
                  aria-label={`Select color ${color}`}
                />
              ))}
            </div>
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Save changes
            </button>
          </div>
        </section>

        {/* Notifications section */}
        <section className="bg-card border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">
            Notifications
          </h2>
          <div className="space-y-3">
            {[
              { label: "Email reminders", description: "Receive email reminders for upcoming events" },
              { label: "Push notifications", description: "Receive push notifications on your devices" },
              { label: "iMessage summaries", description: "Daily agenda via iMessage" },
            ].map(({ label, description }) => (
              <label
                key={label}
                className="flex items-start gap-3 cursor-pointer"
              >
                <input
                  type="checkbox"
                  defaultChecked
                  className="mt-0.5 rounded border-input"
                />
                <div>
                  <div className="text-sm font-medium text-foreground">
                    {label}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {description}
                  </div>
                </div>
              </label>
            ))}
          </div>
        </section>

        {/* Security section */}
        <section className="bg-card border rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-foreground">Security</h2>
          <button
            type="button"
            className="text-sm text-primary hover:underline"
          >
            Change password
          </button>
        </section>
      </div>
    </main>
  );
}
