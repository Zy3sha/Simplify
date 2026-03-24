// ══════════════════════════════════════════════════════════════════
// OBubba — Firebase Cloud Functions
// Push notifications, scheduled reminders, and background tasks
// ══════════════════════════════════════════════════════════════════

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onDocumentCreated, onDocumentUpdated } = require("firebase-functions/v2/firestore");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getMessaging } = require("firebase-admin/messaging");

initializeApp();
const db = getFirestore();
const messaging = getMessaging();

// ── Send push notification to a specific user ───────────────────
async function sendPush(uid, { title, body, data = {} }) {
  try {
    const tokenDoc = await db.collection("fcm_tokens").doc(uid).get();
    if (!tokenDoc.exists) return;

    const token = tokenDoc.data().token;
    if (!token) return;

    await messaging.send({
      token,
      notification: { title, body },
      data: { ...data, click_action: "FLUTTER_NOTIFICATION_CLICK" },
      apns: {
        payload: {
          aps: {
            sound: "default",
            badge: 1,
            "mutable-content": 1,
          },
        },
      },
      android: {
        priority: "high",
        notification: {
          sound: "default",
          channelId: data.channelId || "obubba_reminders",
          color: "#C07088",
          icon: "ic_notification",
        },
      },
    });
  } catch (err) {
    // Token may be invalid — clean up
    if (
      err.code === "messaging/invalid-registration-token" ||
      err.code === "messaging/registration-token-not-registered"
    ) {
      await db.collection("fcm_tokens").doc(uid).delete();
    }
    console.error(`Push to ${uid} failed:`, err.message);
  }
}

// ── Feed reminder: notify if no feed logged in 4+ hours ─────────
exports.feedReminder = onSchedule("every 30 minutes", async () => {
  const cutoff = Date.now() - 4 * 60 * 60 * 1000; // 4 hours ago
  const tokens = await db.collection("fcm_tokens").get();

  for (const doc of tokens.docs) {
    const uid = doc.id;
    try {
      // Check user's last feed from their synced data
      const userDoc = await db.collection("users").doc(uid).get();
      if (!userDoc.exists) continue;

      const data = userDoc.data();
      const lastFeedTime = data.lastFeedTimestamp;

      if (lastFeedTime && lastFeedTime.toMillis() < cutoff) {
        const hoursSince = Math.round((Date.now() - lastFeedTime.toMillis()) / 3600000);
        await sendPush(uid, {
          title: "Feed Reminder",
          body: `It's been ${hoursSince} hours since the last feed. Time for another?`,
          data: { action: "log_feed", channelId: "obubba_reminders" },
        });
      }
    } catch (err) {
      console.error(`Feed reminder for ${uid}:`, err.message);
    }
  }
});

// ── Medicine reminder: notify when dose is due ──────────────────
exports.medicineReminder = onSchedule("every 15 minutes", async () => {
  const now = Date.now();
  const reminders = await db
    .collection("medicine_reminders")
    .where("nextDue", "<=", new Date(now))
    .where("sent", "==", false)
    .get();

  for (const doc of reminders.docs) {
    const data = doc.data();
    try {
      await sendPush(data.uid, {
        title: `Medicine: ${data.name}`,
        body: `Time for ${data.dose || ""} ${data.name}`,
        data: { action: "log_medicine", channelId: "obubba_reminders" },
      });
      await doc.ref.update({ sent: true });
    } catch (err) {
      console.error(`Medicine reminder ${doc.id}:`, err.message);
    }
  }
});

// ── Appointment reminder: 1 hour before ─────────────────────────
exports.appointmentReminder = onSchedule("every 15 minutes", async () => {
  const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000);
  const now = new Date();

  const appts = await db
    .collection("appointments")
    .where("datetime", ">=", now)
    .where("datetime", "<=", oneHourFromNow)
    .where("reminded", "==", false)
    .get();

  for (const doc of appts.docs) {
    const data = doc.data();
    try {
      const travelNote = data.travelMins ? ` Leave in ${data.travelMins} mins.` : "";
      await sendPush(data.uid, {
        title: `Upcoming: ${data.title}`,
        body: `In 1 hour${data.time ? " at " + data.time : ""}.${travelNote}`,
        data: { action: "appointments", channelId: "obubba_reminders" },
      });
      await doc.ref.update({ reminded: true });
    } catch (err) {
      console.error(`Appointment reminder ${doc.id}:`, err.message);
    }
  }
});

// ── Welcome push: send 1 day after signup ───────────────────────
exports.onNewUser = onDocumentCreated("fcm_tokens/{uid}", async (event) => {
  const uid = event.params.uid;

  // Schedule a welcome message for 24 hours later
  await db.collection("scheduled_pushes").add({
    uid,
    sendAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    title: "Welcome to OBubba!",
    body: "Tip: Long-press the quick buttons for detailed logging. You can also say \"Hey Siri, log a feed in OBubba\".",
    data: { action: "open" },
    sent: false,
  });
});

// ── Process scheduled pushes ────────────────────────────────────
exports.processScheduledPushes = onSchedule("every 5 minutes", async () => {
  const now = new Date();
  const pending = await db
    .collection("scheduled_pushes")
    .where("sendAt", "<=", now)
    .where("sent", "==", false)
    .limit(50)
    .get();

  for (const doc of pending.docs) {
    const data = doc.data();
    try {
      await sendPush(data.uid, {
        title: data.title,
        body: data.body,
        data: data.data || {},
      });
      await doc.ref.update({ sent: true });
    } catch (err) {
      console.error(`Scheduled push ${doc.id}:`, err.message);
    }
  }
});

// ── Weekly digest: Monday morning summary ───────────────────────
exports.weeklyDigest = onSchedule("every monday 08:00", async () => {
  const tokens = await db.collection("fcm_tokens").get();

  for (const doc of tokens.docs) {
    const uid = doc.id;
    try {
      // Check if user has weekly digest enabled
      const prefs = await db.collection("user_prefs").doc(uid).get();
      if (prefs.exists && prefs.data().weeklyDigest === false) continue;

      await sendPush(uid, {
        title: "Your Weekly Summary is Ready",
        body: "See how baby's week went — feeds, sleep patterns, and milestones.",
        data: { action: "baby_summary", channelId: "obubba_milestones" },
      });
    } catch (err) {
      console.error(`Weekly digest for ${uid}:`, err.message);
    }
  }
});
