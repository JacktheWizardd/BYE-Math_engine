import { StyleSheet, Text, View } from 'react-native';
import type { FigureIssue } from '../spec/index.ts';
import type { ByeTheme } from '../core/index.ts';

declare const __DEV__: boolean | undefined;

export interface FigureErrorProps {
  errors: FigureIssue[];
  /** The figure's describe text, if it could be read: shown so the step still makes sense. */
  describe?: string;
  width?: number;
  height?: number;
  theme: ByeTheme;
  /** Show the validation messages (defaults to __DEV__). */
  showDetails?: boolean;
}

/** Shown instead of a figure that failed validation. Never blank, never throws. */
export function FigureError({ errors, describe, width, height, theme, showDetails }: FigureErrorProps) {
  const details = showDetails ?? (typeof __DEV__ !== 'undefined' ? __DEV__ : false);
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={describe ?? 'Figure could not be drawn'}
      style={[styles.box, { width, minHeight: height, borderColor: theme.roles.axis.color, backgroundColor: theme.background }]}
    >
      {describe ? <Text style={[styles.describe, { color: theme.roles.text.color }]}>{describe}</Text> : null}
      {details ? (
        <View style={styles.details}>
          <Text style={[styles.title, { color: theme.roles.bound.color }]}>Figure couldn't be drawn</Text>
          {errors.map((e, i) => (
            <Text key={i} style={[styles.error, { color: theme.roles.note.color }]}>
              {e.path ? `${e.path}: ` : ''}
              {e.message}
            </Text>
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderStyle: 'dashed', borderRadius: 6, padding: 12, justifyContent: 'center' },
  describe: { fontSize: 14, lineHeight: 20 },
  details: { marginTop: 8 },
  title: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
  error: { fontSize: 12, lineHeight: 17, fontFamily: 'Menlo' },
});
