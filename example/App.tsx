import { useState } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { STIXTwoText_400Regular, STIXTwoText_400Regular_Italic } from '@expo-google-fonts/stix-two-text';
import { ZenKakuGothicNew_400Regular } from '@expo-google-fonts/zen-kaku-gothic-new';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ByeFigure } from 'bye-math-engine/native';
import 'bye-math-engine/native3d'; // lets ByeFigure draw plot3d figures
import { badInputs, gallery, showcase, stage2, stage3, stage4 } from './figures';

const ink = '#1e1c19';
const ink2 = '#5a554d';
const paper = '#f6f3ec';
const ai = '#2f4b7c';

function Card({ title, figure, replayKey, reduceMotion }: { title: string; figure: unknown; replayKey?: number; reduceMotion?: boolean }) {
  return (
    <View style={styles.card}>
      <Text style={styles.h2}>{title}</Text>
      <ByeFigure figure={figure} replayKey={replayKey} {...(reduceMotion ? { reduceMotion: true } : {})} />
      <Text style={styles.describe}>{(figure as { describe: string }).describe}</Text>
    </View>
  );
}

// Build with EXPO_PUBLIC_SHOWCASE=3d for a page with only the 3D figures (for sharing).
const SHOWCASE_3D = process.env.EXPO_PUBLIC_SHOWCASE === '3d';
const is3d = (f: { figure: unknown }) => (f.figure as { kind?: string }).kind === 'plot3d';

// Showcase: give every element an entrance (surfaces rise, curves draw, the rest fade in),
// main shapes first, then planes, then level curves, then points and arrows.
type El = { type: string; animate?: unknown };
const stepOf = (type: string) => (['surface', 'paramSurface', 'curve'].includes(type) ? 0 : ['plane', 'tangentPlane'].includes(type) ? 1 : type === 'contour' ? 2 : 3);
const withEntrance = (figure: unknown) => {
  const f = figure as { elements: El[] };
  return {
    ...f,
    elements: f.elements.map((el) => {
      const step = stepOf(el.type);
      const main = step === 0;
      return el.animate ? el : { ...el, animate: { duration: main ? 1600 : 700, delay: main ? 0 : 1300 + (step - 1) * 450 } };
    }),
  };
};
const showcase3d = [
  { heading: 'Physics & engineering', items: showcase },
  { heading: 'Calculus III', items: stage4.filter(is3d).map((f) => ({ ...f, title: f.title.replace(' (drag to rotate)', '') })) },
].map((g) => ({ ...g, items: g.items.map((f) => ({ ...f, figure: withEntrance(f.figure) })) }));

function ShowcaseCard({ title, figure, replayKey }: { title: string; figure: unknown; replayKey: number }) {
  const [own, setOwn] = useState(0);
  return (
    <View style={[styles.cell, styles.card]}>
      <View style={styles.cardHead}>
        <Text style={[styles.h2, styles.cardTitle]}>{title}</Text>
        <Pressable onPress={() => setOwn((k) => k + 1)} style={styles.replaySmall} accessibilityRole="button" accessibilityLabel={`Replay ${title}`}>
          <Text style={styles.replaySmallText}>↻ Replay</Text>
        </Pressable>
      </View>
      <ByeFigure figure={figure} replayKey={`${replayKey}-${own}`} autoRotate={8} />
      <Text style={styles.describe}>{(figure as { describe: string }).describe}</Text>
    </View>
  );
}

function Showcase3D() {
  const [replayKey, setReplayKey] = useState(0);
  return (
    <ScrollView contentContainerStyle={[styles.content, styles.wide]}>
      <Text style={styles.h1}>BYE Math Engine · 3D</Text>
      <Text style={styles.sub}>Drag any figure to rotate it. Every figure is drawn from a short JSON description.</Text>
      <View style={styles.controls}>
        <Pressable onPress={() => setReplayKey((k) => k + 1)} style={styles.button} accessibilityRole="button">
          <Text style={styles.buttonText}>Replay all</Text>
        </Pressable>
      </View>
      {showcase3d.map(({ heading, items }) => (
        <View key={heading}>
          <Text style={[styles.h1, styles.section]}>{heading}</Text>
          <View style={styles.grid}>
            {items.map(({ title, figure }) => (
              <ShowcaseCard key={title} title={title} figure={figure} replayKey={replayKey} />
            ))}
          </View>
        </View>
      ))}
    </ScrollView>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({ STIXTwoText_400Regular, STIXTwoText_400Regular_Italic, ZenKakuGothicNew_400Regular });
  const [replayKey, setReplayKey] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  if (!fontsLoaded) return <View style={styles.screen} />;
  if (SHOWCASE_3D) {
    return (
      <View style={styles.screen}>
        <Showcase3D />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>BYE Math Engine</Text>
        <Text style={styles.sub}>Gallery · Stage 4 (3D for Calc III)</Text>

        <View style={styles.controls}>
          <Pressable onPress={() => setReplayKey((k) => k + 1)} style={styles.button} accessibilityRole="button" testID="replay">
            <Text style={styles.buttonText}>Replay animations</Text>
          </Pressable>
          <Pressable
            onPress={() => setReduceMotion((v) => !v)}
            style={[styles.button, reduceMotion && styles.buttonOn]}
            accessibilityRole="switch"
            accessibilityState={{ checked: reduceMotion }}
            testID="reduce-motion"
          >
            <Text style={[styles.buttonText, reduceMotion && styles.buttonTextOn]}>Reduce motion: {reduceMotion ? 'on' : 'off'}</Text>
          </Pressable>
        </View>

        <Text style={[styles.h1, styles.section]}>Physics & engineering</Text>
        {showcase.map(({ title, figure }) => (
          <Card key={title} title={title} figure={figure} replayKey={replayKey} reduceMotion={reduceMotion} />
        ))}

        <Text style={[styles.h1, styles.section]}>Stage 4: 3D</Text>
        {stage4.map(({ title, figure }) => (
          <Card key={title} title={title} figure={figure} replayKey={replayKey} reduceMotion={reduceMotion} />
        ))}

        <Text style={[styles.h1, styles.section]}>Stage 3</Text>
        {stage3.map(({ title, figure }) => (
          <Card key={title} title={title} figure={figure} replayKey={replayKey} reduceMotion={reduceMotion} />
        ))}

        <Text style={[styles.h1, styles.section]}>Stage 2</Text>
        {stage2.map(({ title, figure }) => (
          <Card key={title} title={title} figure={figure} replayKey={replayKey} reduceMotion={reduceMotion} />
        ))}

        <Text style={[styles.h1, styles.section]}>Stage 1</Text>
        {gallery.map(({ title, figure }) => (
          <Card key={title} title={title} figure={figure} />
        ))}

        <Text style={[styles.h1, styles.section]}>Bad input</Text>
        <Text style={styles.sub}>Shown as an error box, never a crash or a blank figure.</Text>
        {badInputs.map(({ title, figure }) => (
          <View key={title} style={styles.card}>
            <Text style={styles.h2}>{title}</Text>
            <ByeFigure figure={figure} showErrorDetails />
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: paper, paddingTop: Platform.OS === 'ios' ? 54 : 24 },
  // 390pt phone → 338pt content at 26pt margins.
  content: { paddingHorizontal: 26, paddingVertical: 24, maxWidth: 390, width: '100%', alignSelf: 'center' },
  h1: { fontFamily: 'STIXTwoText_400Regular', fontSize: 26, color: ink },
  section: { marginTop: 32 },
  sub: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 13, color: ink2, marginBottom: 12 },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  button: { borderWidth: 1, borderColor: ai, borderRadius: 6, paddingHorizontal: 12, paddingVertical: 7 },
  buttonText: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 13, color: ai },
  buttonOn: { backgroundColor: ai },
  buttonTextOn: { color: paper },
  card: { marginTop: 20 },
  wide: { maxWidth: 1180 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginHorizontal: -14 },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 6 },
  cardTitle: { flex: 1, marginBottom: 0 },
  replaySmall: { borderWidth: 1, borderColor: ai, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 3 },
  replaySmallText: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 12, color: ai },
  cell: { width: 350, maxWidth: '100%', paddingHorizontal: 14 },
  h2: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 14, color: ink, marginBottom: 6 },
  describe: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 12, color: ink2, marginTop: 6, lineHeight: 17 },
});
