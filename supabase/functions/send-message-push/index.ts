import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const webhookSecret = Deno.env.get("CUCKOO_PUSH_WEBHOOK_SECRET")!;
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

type MessageRecord = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  message_type?: string;
};

type PushTokenRow = {
  expo_push_token: string;
  sound_enabled: boolean;
  device_platform: "android" | "ios";
};

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  if (!webhookSecret || request.headers.get("x-cuckoo-webhook-secret") !== webhookSecret) {
    return new Response("Unauthorized", { status: 401 });
  }

  try {
    const payload = await request.json();
    const message = (payload.record || payload) as MessageRecord;
    if (!message?.id || !message.conversation_id || !message.sender_id) {
      return Response.json({ error: "Invalid message payload" }, { status: 400 });
    }

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .select("user_one_id, user_two_id")
      .eq("id", message.conversation_id)
      .maybeSingle();

    if (conversationError) throw conversationError;
    if (!conversation ||
        (conversation.user_one_id !== message.sender_id && conversation.user_two_id !== message.sender_id)) {
      return Response.json({ error: "Conversation or sender not valid" }, { status: 403 });
    }

    const recipientId = conversation.user_one_id === message.sender_id
      ? conversation.user_two_id
      : conversation.user_one_id;

    const { data: devices, error: tokenError } = await supabase
      .from("user_push_tokens")
      .select("expo_push_token, sound_enabled, device_platform")
      .eq("user_id", recipientId);

    if (tokenError) throw tokenError;
    const tokens = (devices || []) as PushTokenRow[];
    if (!tokens.length) return Response.json({ sent: 0, reason: "No registered recipient devices" });

    const body = message.message_type === "voice"
      ? "You received a voice message."
      : (message.body || "You received a message.").slice(0, 140);

    const messages = tokens.map((device) => ({
      to: device.expo_push_token,
      title: "New message",
      body,
      sound: device.sound_enabled ? "cuckoo_default_natural.wav" : null,
      channelId: device.sound_enabled ? "messages-cuckoo-sound" : "messages-silent",
      priority: "high",
      data: { conversationId: message.conversation_id, messageId: message.id },
    }));

    const invalidTokens: string[] = [];
    let sent = 0;
    for (let offset = 0; offset < messages.length; offset += 100) {
      const batch = messages.slice(offset, offset + 100);
      const response = await fetch("https://exp.host/--/api/v2/push/send", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(batch),
      });
      if (!response.ok) {
        const detail = await response.text();
        console.error("Expo push gateway rejected a batch:", response.status, detail.slice(0, 400));
        continue;
      }
      const result = await response.json();
      for (let index = 0; index < (result.data || []).length; index++) {
        const ticket = result.data[index];
        if (ticket.status === "ok") sent++;
        if (ticket.details?.error === "DeviceNotRegistered") {
          invalidTokens.push(batch[index].to);
        }
      }
    }

    if (invalidTokens.length) {
      await supabase.from("user_push_tokens").delete().in("expo_push_token", invalidTokens);
    }

    return Response.json({ sent, devices: tokens.length });
  } catch (error) {
    console.error("Message push delivery failed:", error);
    return Response.json({ error: "Push delivery failed" }, { status: 500 });
  }
});
