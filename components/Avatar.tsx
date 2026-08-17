import React, { useState, useEffect } from 'react';
import { View, Text, Image, StyleProp, ViewStyle } from 'react-native';
import { FONTS } from '../utils/theme';

const AVATAR_MAX_RETRIES = 3;

// Shared avatar: shows the photo if one loads, otherwise the person's
// initials on a colored circle — never a blank/empty fallback. A failed
// load retries a few times (via a changing key, forcing a fresh request)
// before giving up, since a single transient failure (flaky network, or a
// rate-limited request) shouldn't hide a photo for the rest of the app
// session. See utils/cloudSync.ts's cleanupOrphanedR2Media fix and
// ActivityCard/SessionCard for the history behind this.
export default function Avatar({
  name,
  avatarUrl,
  size,
  backgroundColor,
  textColor,
  style,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  size: number;
  backgroundColor: string;
  textColor: string;
  style?: StyleProp<ViewStyle>;
}) {
  const [retryCount, setRetryCount] = useState(0);
  const initials = (name || '?').split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);
  const isUrl = !!avatarUrl && (avatarUrl.startsWith('http://') || avatarUrl.startsWith('https://') || avatarUrl.startsWith('file://'));

  useEffect(() => { setRetryCount(0); }, [avatarUrl]);

  const failed = retryCount > AVATAR_MAX_RETRIES;

  return (
    <View
      style={[
        { width: size, height: size, borderRadius: size / 2, backgroundColor, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
        style,
      ]}
    >
      {isUrl && !failed ? (
        <Image
          key={`${avatarUrl}-${retryCount}`}
          source={{ uri: avatarUrl! }}
          style={{ width: size, height: size }}
          onError={() => setTimeout(() => setRetryCount(c => c + 1), 600)}
        />
      ) : (
        <Text style={{ color: textColor, fontSize: size * 0.32, fontFamily: FONTS.family.bold }}>{initials}</Text>
      )}
    </View>
  );
}
