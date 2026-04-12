import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { notificationsApi } from "@/lib/api";
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from "@/lib/pushNotifications";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Bell, BellOff, Zap, Clock, AlertCircle } from "lucide-react";

interface CheckResult {
  expiring_count: number;
  expired_count: number;
  sent_expiring_notification: boolean;
  sent_expired_notification: boolean;
  subscriptions_total?: number;
  push_attempted?: number;
  push_delivered?: number;
  push_failed?: number;
  subscriptions_removed_stale?: number;
}

export default function PushTest() {
  const [subStatus, setSubStatus] = useState<"unknown" | "subscribed" | "unsubscribed">("unknown");
  const [log, setLog] = useState<Array<{ ts: string; msg: string; ok: boolean }>>([]);

  function addLog(msg: string, ok = true) {
    setLog(prev => [{ ts: new Date().toLocaleTimeString(), msg, ok }, ...prev]);
  }

  async function checkSub() {
    const sub = await getCurrentSubscription();
    const status = sub ? "subscribed" : "unsubscribed";
    setSubStatus(status);
    addLog(`Subscription status: ${status}`, true);
  }

  async function handleSubscribe() {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      addLog("Notification permission denied", false);
      return;
    }
    const sub = await subscribeToPush();
    if (sub) {
      setSubStatus("subscribed");
      addLog("Subscribed successfully", true);
    } else {
      addLog("Subscription failed – check VAPID keys and HTTPS", false);
    }
  }

  async function handleUnsubscribe() {
    const ok = await unsubscribeFromPush();
    if (ok) {
      setSubStatus("unsubscribed");
      addLog("Unsubscribed", true);
    } else {
      addLog("Unsubscribe failed", false);
    }
  }

  const expiryMutation = useMutation({
    mutationFn: () => notificationsApi.triggerExpiryCheck(),
    onSuccess: (data: CheckResult) => {
      addLog(
        `Expiry check done – expiring: ${data.expiring_count}, expired: ${data.expired_count}. ` +
        `Sent expiring: ${data.sent_expiring_notification}, sent expired: ${data.sent_expired_notification}. ` +
        `Subs: ${data.subscriptions_total ?? 0}, attempted: ${data.push_attempted ?? 0}, delivered: ${data.push_delivered ?? 0}, failed: ${data.push_failed ?? 0}`,
        true
      );
    },
    onError: (err: Error) => addLog(`Error: ${err.message}`, false),
  });

  async function handleDelayedTrigger(delaySecs: number) {
    addLog(`Expiry check scheduled in ${delaySecs}s…`);
    setTimeout(() => expiryMutation.mutate(), delaySecs * 1000);
  }

  async function handleLocalNotification() {
    if (Notification.permission !== "granted") {
      addLog("Notification permission not granted", false);
      return;
    }
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification("🧪 Test Notification", {
      body: "This is a local test notification from Household Manager.",
      icon: "/vite.svg",
      tag: "test-local",
    });
    addLog("Local notification sent", true);
  }

  return (
    <div className="p-4 pb-24 space-y-4 max-w-lg mx-auto">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-yellow-500" />
        <h1 className="text-xl font-bold">Push Notification Test Panel</h1>
      </div>
      <p className="text-xs text-muted-foreground">
        Test and manage push notification subscriptions and triggers.
      </p>

      {/* Subscription Status */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-sm">Subscription</span>
            <Badge
              variant={subStatus === "subscribed" ? "success" : subStatus === "unsubscribed" ? "destructive" : "secondary"}
            >
              {subStatus}
            </Badge>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={checkSub}>
              Check Status
            </Button>
            <Button size="sm" onClick={handleSubscribe} className="gap-1">
              <Bell className="h-4 w-4" /> Subscribe
            </Button>
            <Button size="sm" variant="destructive" onClick={handleUnsubscribe} className="gap-1">
              <BellOff className="h-4 w-4" /> Unsubscribe
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Trigger Notifications */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="font-semibold text-sm">Trigger Expiry Check</p>
          <div className="flex gap-2 flex-wrap">
            <Button
              size="sm"
              onClick={() => expiryMutation.mutate()}
              disabled={expiryMutation.isPending}
              className="gap-1"
            >
              <Zap className="h-4 w-4" /> Now
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDelayedTrigger(30)}
              className="gap-1"
            >
              <Clock className="h-4 w-4" /> In 30s
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDelayedTrigger(120)}
              className="gap-1"
            >
              <Clock className="h-4 w-4" /> In 2min
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDelayedTrigger(300)}
              className="gap-1"
            >
              <Clock className="h-4 w-4" /> In 5min
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Local notification test */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <p className="font-semibold text-sm">Local Browser Notification</p>
          <p className="text-xs text-muted-foreground">
            Shows a local notification directly via the service worker (no server push).
          </p>
          <Button size="sm" variant="outline" onClick={handleLocalNotification} className="gap-1">
            <AlertCircle className="h-4 w-4" /> Show Local Notification
          </Button>
        </CardContent>
      </Card>

      {/* Log */}
      <Card>
        <CardContent className="p-4 space-y-2">
          <p className="font-semibold text-sm">Log</p>
          {log.length === 0 ? (
            <p className="text-xs text-muted-foreground">No events yet.</p>
          ) : (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {log.map((entry, i) => (
                <div key={i} className="flex gap-2 text-xs">
                  <span className="text-muted-foreground shrink-0">{entry.ts}</span>
                  <span className={entry.ok ? "text-foreground" : "text-red-500"}>{entry.msg}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
