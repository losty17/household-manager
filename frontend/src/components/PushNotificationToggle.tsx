import { useState, useEffect } from "react";
import { Bell, BellOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { subscribeToPush, unsubscribeFromPush, getCurrentSubscription } from "@/lib/pushNotifications";

export default function PushNotificationToggle() {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    if ("PushManager" in window && "serviceWorker" in navigator) {
      setSupported(true);
      getCurrentSubscription().then(sub => setSubscribed(!!sub));
    }
  }, []);

  if (!supported) return null;

  const handleToggle = async () => {
    setLoading(true);
    try {
      if (subscribed) {
        const ok = await unsubscribeFromPush();
        if (ok) setSubscribed(false);
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return;
        const sub = await subscribeToPush();
        if (sub) setSubscribed(true);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={handleToggle}
      disabled={loading}
      title={subscribed ? "Disable push notifications" : "Enable push notifications"}
      className={subscribed ? "text-primary" : "text-muted-foreground"}
    >
      {subscribed ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
    </Button>
  );
}
