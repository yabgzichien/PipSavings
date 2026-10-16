import React from 'react';
import { StyleSheet, View } from 'react-native';
import type { RecapStoryScene } from '../../lib/recapStory';
import { STORY_LOGICAL_HEIGHT, STORY_LOGICAL_WIDTH } from '../../lib/recapStoryTheme';
import type { WidgetMascotConfig } from '../../widget/mascot/config';
import { RecapStoryFrame } from './RecapStoryFrame';

export interface RecapStoryExportSurfaceProps {
  scene: RecapStoryScene;
  mascotConfig: WidgetMascotConfig;
  monthLabel: string;
  categoryLabel: (categoryId: string) => string;
  month?: string;
  currency?: string;
  hideAmounts?: boolean;
}

/** A single, settled logical-size frame shared by native view-shot and the web adapter. */
export const RecapStoryExportSurface = React.forwardRef<React.ComponentRef<typeof View>, RecapStoryExportSurfaceProps>(
  function RecapStoryExportSurface({ scene, mascotConfig, monthLabel, categoryLabel, month, currency, hideAmounts }, ref) {
    return <View testID="story-export-container" collapsable={false} style={styles.container}
      pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View ref={ref} testID="story-export-surface" collapsable={false} style={styles.surface}>
        <RecapStoryFrame scene={scene} mode="export" motion="off" mascotConfig={mascotConfig}
          monthLabel={monthLabel} categoryLabel={categoryLabel} month={month}
          currency={currency} hideAmounts={hideAmounts} />
      </View>
    </View>;
  },
);

const styles = StyleSheet.create({
  // Keep the node mounted and paintable: hidden/transparent trees produce blank captures.
  container: {
    position: 'absolute',
    left: -STORY_LOGICAL_WIDTH * 3,
    top: 0,
    width: STORY_LOGICAL_WIDTH,
    height: STORY_LOGICAL_HEIGHT,
  },
  // Capture the child at its own origin. The off-screen offset must not be
  // cloned into html-to-image's SVG document on web.
  surface: { width: STORY_LOGICAL_WIDTH, height: STORY_LOGICAL_HEIGHT },
});
