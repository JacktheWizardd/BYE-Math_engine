import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { STIXTwoText_400Regular, STIXTwoText_400Regular_Italic } from '@expo-google-fonts/stix-two-text';
import { ZenKakuGothicNew_400Regular } from '@expo-google-fonts/zen-kaku-gothic-new';
import { SafeAreaView, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ByeFigure } from 'bye-math-engine/native';
import { badInputs, gallery } from './figures';

const ink = '#1e1c19';
const ink2 = '#5a554d';
const paper = '#f6f3ec';

export default function App() {
  const [fontsLoaded] = useFonts({ STIXTwoText_400Regular, STIXTwoText_400Regular_Italic, ZenKakuGothicNew_400Regular });
  if (!fontsLoaded) return <View style={styles.screen} />;

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.h1}>BYE Math Engine</Text>
        <Text style={styles.sub}>Gallery · Stage 1 (static 2D)</Text>

        {gallery.map(({ title, figure }) => (
          <View key={title} style={styles.card} testID={`figure-${title}`}>
            <Text style={styles.h2}>{title}</Text>
            <ByeFigure figure={figure} />
            <Text style={styles.describe}>{(figure as { describe: string }).describe}</Text>
          </View>
        ))}

        <Text style={[styles.h1, { marginTop: 24 }]}>Bad input</Text>
        <Text style={styles.sub}>Shown as an error box, never a crash or a blank figure.</Text>
        {badInputs.map(({ title, figure }) => (
          <View key={title} style={styles.card}>
            <Text style={styles.h2}>{title}</Text>
            <ByeFigure figure={figure} showErrorDetails />
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: paper },
  // 390pt phone → 338pt content at 26pt margins.
  content: { paddingHorizontal: 26, paddingVertical: 24, maxWidth: 390, width: '100%', alignSelf: 'center' },
  h1: { fontFamily: 'STIXTwoText_400Regular', fontSize: 26, color: ink },
  sub: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 13, color: ink2, marginBottom: 12 },
  card: { marginTop: 20 },
  h2: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 14, color: ink, marginBottom: 6 },
  describe: { fontFamily: 'ZenKakuGothicNew_400Regular', fontSize: 12, color: ink2, marginTop: 6, lineHeight: 17 },
});
