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

export default function App() {
  const [fontsLoaded] = useFonts({ STIXTwoText_400Regular, STIXTwoText_400Regular_Italic, ZenKakuGothicNew_400Regular });
  const [replayKey, setReplayKey] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  if (!fontsLoaded) return <View style={styles.screen} />;

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
  h2: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 14, color: ink, marginBottom: 6 },
  describe: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 12, color: ink2, marginTop: 6, lineHeight: 17 },
});
