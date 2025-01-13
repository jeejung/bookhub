import { useEffect, useState } from "react"
import { Text, View } from "react-native"
import { Camera, useCameraDevice, useCodeScanner } from "react-native-vision-camera"

export const BarcodeScanner = (): React.JSX.Element => {
    const device = useCameraDevice('back')
    const [cameraPermission, setCameraPermission] = useState<boolean>()

    const checkCameraPermission = async () => {
        const status = await Camera.getCameraPermissionStatus()
        console.log('status', status)

        if (status === 'granted') {
            setCameraPermission(true)
        } else if (status === 'not-determined' || status === 'denied') {
            console.log('status2', status)
            const permission = await Camera.requestCameraPermission()
            setCameraPermission(permission === 'granted')
        } else {
            setCameraPermission(false)
        }
    }

    const codeScanner = useCodeScanner({
        codeTypes: ['code-128', 'code-39', 'code-93', 'codabar', 'ean-13', 'ean-8', 'itf', 'itf-14', 'upc-e', 'upc-a', 'pdf-417', 'aztec', 'data-matrix'],
        onCodeScanned: (code) => {
            console.log('code: ', code)
        }
    })

    useEffect(() => {
        checkCameraPermission()
    }, [])

    if (cameraPermission === null) {
        return <Text>Checking camera permission...</Text>
    } else if (!cameraPermission) {
        return <Text>Camera permission not granted</Text>
    }

    if (device == null) return <Text>No Device</Text>

    return (
        <View style={{ flex: 1 }}>
            <Camera
                device={device}
                isActive={true}
                style={{ flex: 1, borderWidth: 1, borderColor: 'red', height: 300 }}
                codeScanner={codeScanner}
            />
        </View>
    )
}