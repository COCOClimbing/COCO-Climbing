import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from './supabase';
import { useNav } from './NavigationContext';
import { getProfileById } from './friendsApi';

const NOTIFIED_CACHE_PREFIX = 'tag_notif_sent:';
const EAS_PROJECT_ID = '4e4e63a8-46b2-4df5-9a79-53ebe1b594c5';

// Show notifications even when app is in the foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function registerForPushNotifications(userId: string): Promise<void> {
  try {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') return;

    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: EAS_PROJECT_ID,
    });

    const { error } = await supabase.from('push_tokens').upsert(
      {
        user_id: userId,
        token: tokenData.data,
        platform: Platform.OS,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id' }
    );

    if (error) console.error('[notifications] Failed to save push token:', error.message);
  } catch (err) {
    console.error('[notifications] registerForPushNotifications failed:', err);
  }
}

async function sendNotification(
  type: string,
  recipientId: string | string[],
  senderId: string,
  extra?: object
): Promise<boolean> {
  const payload: Record<string, unknown> = {
    type,
    senderId,
    ...extra,
  };

  if (Array.isArray(recipientId)) {
    payload.recipientIds = recipientId;
  } else {
    payload.recipientId = recipientId;
  }

  const { error, data } = await supabase.functions.invoke('send-notification', { body: payload });

  if (error) {
    console.error(`[notifications] send-notification (${type}) failed:`, error.message);
    return false;
  }
  if (data && !data.sent) {
    console.warn(`[notifications] send-notification (${type}) not sent: ${data.reason}`);
    return false;
  }
  return true;
}

export async function sendTagNotificationsIfNeeded(
  sessionId: string,
  friends: Array<{ id: string; name: string }>,
  taggerUserId: string
): Promise<void> {
  if (!friends?.length) return;

  // Only notify friends not yet notified for this session
  const cacheKey = `${NOTIFIED_CACHE_PREFIX}${sessionId}`;
  const raw = await AsyncStorage.getItem(cacheKey);
  const alreadyNotified = new Set<string>(raw ? JSON.parse(raw) : []);

  const newFriends = friends.filter(f => f.id && !alreadyNotified.has(f.id));
  if (!newFriends.length) return;

  const sent = await sendNotification(
    'session_tag',
    newFriends.map(f => f.id),
    taggerUserId,
    { sessionId }
  );

  if (sent) {
    const updated = [...alreadyNotified, ...newFriends.map(f => f.id)];
    await AsyncStorage.setItem(cacheKey, JSON.stringify(updated));
  }
}

export async function sendLikeNotification(sessionOwnerId: string, likerId: string, sessionId: string): Promise<void> {
  if (likerId === sessionOwnerId) return;
  await sendNotification('like', sessionOwnerId, likerId, { sessionId });
}

export async function sendCommentNotification(sessionOwnerId: string, commenterId: string, sessionId: string): Promise<void> {
  if (commenterId === sessionOwnerId) return;
  await sendNotification('comment', sessionOwnerId, commenterId, { sessionId });
}

export async function sendFollowRequestNotification(receiverId: string, senderId: string): Promise<void> {
  await sendNotification('follow_request', receiverId, senderId);
}

export async function sendNewFollowerNotification(receiverId: string, followerId: string): Promise<void> {
  await sendNotification('new_follower', receiverId, followerId);
}

export async function sendFollowRequestAcceptedNotification(requesterId: string, acceptorId: string): Promise<void> {
  await sendNotification('follow_request_accepted', requesterId, acceptorId);
}

export async function sendCommentLikeNotification(commentAuthorId: string, likerId: string, sessionId: string, commentId: string): Promise<void> {
  if (likerId === commentAuthorId) return;
  await sendNotification('comment_like', commentAuthorId, likerId, { sessionId, commentId });
}

const PROFILE_NOTIFICATION_TYPES = new Set(['new_follower', 'follow_request', 'follow_request_accepted']);
const SESSION_NOTIFICATION_TYPES = new Set(['session_tag', 'like', 'comment_like', 'comment']);

// Shared by push-notification tap routing and the in-app notification list,
// so both navigate identically for a given notification type.
export async function routeNotificationTap(
  nav: ReturnType<typeof useNav>,
  type: string,
  opts: { senderId?: string | null; sessionId?: string | null }
): Promise<void> {
  if (PROFILE_NOTIFICATION_TYPES.has(type)) {
    if (!opts.senderId) return;
    const profile = await getProfileById(opts.senderId);
    if (profile) nav.viewFriendProfile(profile);
    return;
  }

  if (SESSION_NOTIFICATION_TYPES.has(type) && opts.sessionId) {
    nav.viewActivitySession(opts.sessionId);
  }
}

export function useNotificationTapRouting(): void {
  const nav = useNav();
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    function routeTap(data: any) {
      if (!data || typeof data.type !== 'string') return;
      const senderId = data.senderId ?? data.followerId;
      routeNotificationTap(navRef.current, data.type, { senderId, sessionId: data.sessionId }).catch(err => {
        console.error('[notifications] Failed to resolve tap routing:', err);
      });
    }

    // Cold start: the app was launched by tapping a notification while fully closed.
    Notifications.getLastNotificationResponseAsync().then(response => {
      if (response) {
        routeTap(response.notification.request.content.data);
        Notifications.clearLastNotificationResponseAsync();
      }
    });

    // Tap while the app is already running (foreground or backgrounded).
    const sub = Notifications.addNotificationResponseReceivedListener(response => {
      routeTap(response.notification.request.content.data);
    });
    return () => sub.remove();
  }, []);
}
