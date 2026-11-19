import React from 'react';
import { Text, TextStyle, StyleProp } from 'react-native';
import { FONTS } from '../utils/theme';
import { splitMentions } from '../utils/mentions';

// Comment text with @mentions in the accent colour. Mentions are tappable when
// onPressMention is given (e.g. to open that climber's profile).
export default function MentionText({ text, style, accentColor, onPressMention, numberOfLines }: {
  text: string;
  style?: StyleProp<TextStyle>;
  accentColor: string;
  onPressMention?: (username: string) => void;
  numberOfLines?: number;
}) {
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {splitMentions(text).map((p, i) => p.username ? (
        <Text
          key={i}
          style={{ color: accentColor, fontFamily: FONTS.family.semibold }}
          onPress={onPressMention ? () => onPressMention(p.username!) : undefined}
        >
          {p.text}
        </Text>
      ) : (
        <Text key={i}>{p.text}</Text>
      ))}
    </Text>
  );
}
