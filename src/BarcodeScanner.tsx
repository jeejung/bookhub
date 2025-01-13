import { useEffect, useState } from "react";
import { Text, View } from "react-native"
import { Camera, useCameraDevice, useCameraPermission } from "react-native-vision-camera";

export const BarcodeScanner = (): React.JSX.Element => {
    const device = useCameraDevice('back')
    console.log('device', device);
    const [cameraPermission, setCameraPermission] = useState<boolean>();

    const checkCameraPermission = async () => {
        const status = await Camera.getCameraPermissionStatus();
        console.log('status', status);
        
        if (status === 'granted') {
            setCameraPermission(true);
        } else if (status === 'not-determined' || status === 'denied') {
            console.log('status2', status)
            const permission = await Camera.requestCameraPermission();
            setCameraPermission(permission === 'granted');
        } else {
            setCameraPermission(false);
        }
    };
    
    useEffect(() => {
        checkCameraPermission();
    }, []);

    if (cameraPermission === null) {
        return <Text>Checking camera permission...</Text>;
    } else if (!cameraPermission) {
        return <Text>Camera permission not granted</Text>;
    }
    
    if (device == null) return <Text>No Device</Text>
    
    return (
      <View style={{ flex: 1 }}>
        <Text>Real camera!</Text>
        <Camera
            device={device}
            isActive={true}
            style={{ flex: 1, borderWidth: 1, borderColor: 'red', height: 300 }}
        />
      </View>
    )
}