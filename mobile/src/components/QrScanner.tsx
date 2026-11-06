import { useRef } from "react"
import { Linking, StyleSheet, Text, View } from "react-native"
import { CameraView, useCameraPermissions } from "expo-camera"
import { Body, Button } from "@/components/ui"
import { colors } from "@/theme"

/**
 * The camera, reading QR codes. `paused` stops reading while a result is on screen, and the
 * same code isn't reported twice within a few seconds (the camera sees it many times a second).
 */
export default function QrScanner({ onScan, paused, hint }: { onScan: (data: string) => void; paused: boolean; hint: string }) {
  const [permission, requestPermission] = useCameraPermissions()
  const last = useRef<{ data: string; at: number } | null>(null)

  if (!permission) return <View style={styles.box} />
  if (!permission.granted) {
    return (
      <View style={[styles.box, styles.center, { padding: 20, gap: 12 }]}>
        <Body style={{ textAlign: "center" }}>The camera is needed to scan QR codes.</Body>
        {permission.canAskAgain ? (
          <Button label="Allow camera" onPress={() => void requestPermission()} />
        ) : (
          <Button label="Open settings" onPress={() => void Linking.openSettings()} />
        )}
      </View>
    )
  }

  return (
    <View style={styles.box}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={
          paused
            ? undefined
            : ({ data }) => {
                const now = Date.now()
                if (last.current && last.current.data === data && now - last.current.at < 3000) return
                last.current = { data, at: now }
                onScan(data)
              }
        }
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.center]}>
        <View style={styles.frame} />
        <Text style={styles.hint}>{hint}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  box: { width: "100%", aspectRatio: 1, maxHeight: 420, borderRadius: 14, overflow: "hidden", backgroundColor: colors.card },
  center: { alignItems: "center", justifyContent: "center" },
  frame: { width: "65%", aspectRatio: 1, borderColor: colors.primary, borderWidth: 3, borderRadius: 16 },
  hint: { position: "absolute", bottom: 14, color: colors.text, fontSize: 14, backgroundColor: "rgba(3,7,8,0.7)", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6 },
})
