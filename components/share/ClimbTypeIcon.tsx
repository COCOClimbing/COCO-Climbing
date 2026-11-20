import React from 'react';
import { View, Image } from 'react-native';
import type { Discipline } from '../../utils/gradeUtils';
import { px } from './cardKit';

// Each icon's layout box is trimmed to its visible art, so cards can space
// them exactly like the stats around them.
// Artwork pulled from the designer's card exports (white on transparent).
// Chalk bag for boulder/board sessions, carabiner for rope sessions; a mixed
// session shows both side by side.
const CHALK_BAG = require('../../assets/icons/chalk-bag.png');
const CARABINER = require('../../assets/icons/carabiner.png');

// Sizes in design pixels, measured off the 1080px mockups.
const BAG_SIZE = 117;                 // 512×512 source
const BAG_PAD_TOP = 10;               // empty rows above the chalk puffs (45/512)
const BAG_PAD_BOTTOM = 13;            // empty rows below the bag (72/512)
const BINER_W = 73, BINER_H = 91;     // 410×512 source
const BINER_TILT = 38.5;              // the mockups lean the carabiner clockwise
// Box the tilted carabiner actually covers, so it doesn't spill past its layout box.
const rad = (BINER_TILT * Math.PI) / 180;
const BINER_BOX_W = BINER_W * Math.cos(rad) + BINER_H * Math.sin(rad);
const BINER_BOX_H = BINER_W * Math.sin(rad) + BINER_H * Math.cos(rad);
// The rotated rectangle's corners are empty (the carabiner is rounded), so
// trim them off top and bottom to match the visible shape.
const BINER_CORNER_TRIM = 16;

export default function ClimbTypeIcon({ disciplines }: { disciplines: Discipline[] }) {
  if (disciplines.length === 0) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: px(24) }}>
      {disciplines.includes('boulder') && (
        <Image
          source={CHALK_BAG}
          style={{
            width: px(BAG_SIZE), height: px(BAG_SIZE),
            marginTop: -px(BAG_PAD_TOP), marginBottom: -px(BAG_PAD_BOTTOM),
          }}
          resizeMode="contain"
        />
      )}
      {disciplines.includes('rope') && (
        <View style={{
          width: px(BINER_BOX_W), height: px(BINER_BOX_H),
          marginVertical: -px(BINER_CORNER_TRIM),
          alignItems: 'center', justifyContent: 'center',
        }}>
          <Image
            source={CARABINER}
            style={{ width: px(BINER_W), height: px(BINER_H), transform: [{ rotate: `${BINER_TILT}deg` }] }}
            resizeMode="contain"
          />
        </View>
      )}
    </View>
  );
}
