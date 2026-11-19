// Profile links: coco://u/<username>. The Friends page QR code holds one, so
// scanning it with the iPhone Camera opens COCO on that climber's profile.
import { useEffect, useRef } from 'react';
import { Linking } from 'react-native';
import { useNav } from './NavigationContext';
import { findProfileByUsername } from './friendsApi';

export function profileLink(username: string): string {
  return `coco://u/${encodeURIComponent(username)}`;
}

function usernameFromLink(url: string): string | null {
  const m = url.match(/^coco:\/\/u\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export function useProfileLinkRouting(enabled: boolean): void {
  const nav = useNav();
  const navRef = useRef(nav);
  navRef.current = nav;

  useEffect(() => {
    if (!enabled) return;
    async function open(url: string | null) {
      const username = url ? usernameFromLink(url) : null;
      if (!username) return;
      const profile = await findProfileByUsername(username).catch(() => null);
      if (profile) navRef.current.viewFriendProfile(profile);
    }
    Linking.getInitialURL().then(open);
    const sub = Linking.addEventListener('url', ({ url }) => { open(url); });
    return () => sub.remove();
  }, [enabled]);
}
