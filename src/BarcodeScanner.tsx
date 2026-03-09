import { useEffect, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Camera, useCameraDevice, useCodeScanner } from 'react-native-vision-camera'

export const BarcodeScanner = (): React.JSX.Element => {
  const device = useCameraDevice('back')
  const [cameraPermission, setCameraPermission] = useState<boolean>()
  const [bookData, setBookData] = useState<any>(null)
  const lastFetchedISBN = useRef<string>('')
  const lastFetchTime = useRef<number>(0)
  const FETCH_COOLDOWN_MS = 2000 // 2 seconds between fetches

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

  const fetchISBNData = async (isbn: string) => {
    const now = Date.now()

    // Throttle: don't fetch if same ISBN was fetched recently or within cooldown period
    if (isbn === lastFetchedISBN.current && now - lastFetchTime.current < FETCH_COOLDOWN_MS) {
      console.log('Throttling fetch for ISBN:', isbn)
      return
    }

    // Update tracking
    lastFetchedISBN.current = isbn
    lastFetchTime.current = now

    try {
      const response = await fetch(`https://openlibrary.org/isbn/${isbn}.json`)
      if (response.ok) {
        const data = await response.json()
        setBookData(data)
        console.log('Book data:', data)
      } else {
        console.error('Failed to fetch ISBN data:', response.status)
      }
    } catch (error) {
      console.error('Error fetching ISBN data:', error)
    }
  }

  const resetBookData = () => {
    setBookData(null)
    lastFetchedISBN.current = ''
    lastFetchTime.current = 0
  }

  const codeScanner = useCodeScanner({
    codeTypes: [
      'code-128',
      'code-39',
      'code-93',
      'codabar',
      'ean-13',
      'ean-8',
      'itf',
      'itf-14',
      'upc-e',
      'upc-a',
      'pdf-417',
      'aztec',
      'data-matrix',
    ],
    onCodeScanned: (codes) => {
      codes.forEach((code) => {
        console.log('code: ', code)
        if (
          code.value &&
          code.type === 'ean-13' &&
          (code.value.startsWith('978') || code.value.startsWith('979'))
        ) {
          fetchISBNData(code.value)
        }
      })
    },
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
      {bookData && (
        <View style={{ padding: 10 }}>
          <Text style={{ fontWeight: 'bold', fontSize: 16 }}>Book Details:</Text>
          <Text>Title: {bookData.title}</Text>
          {bookData.authors && bookData.authors.length > 0 && (
            <Text>Authors: {bookData.authors.map((a: any) => a.name).join(', ')}</Text>
          )}
          {bookData.publishers && bookData.publishers.length > 0 && (
            <Text>Publisher: {bookData.publishers.join(', ')}</Text>
          )}
          {bookData.isbn_13 && <Text>ISBN-13: {bookData.isbn_13}</Text>}
          {bookData.isbn_10 && <Text>ISBN-10: {bookData.isbn_10}</Text>}
          {bookData.publish_date && <Text>Publish Date: {bookData.publish_date}</Text>}
          {bookData.number_of_pages && <Text>Pages: {bookData.number_of_pages}</Text>}
        </View>
      )}
      <TouchableOpacity
        onPress={resetBookData}
        style={{
          backgroundColor: '#007AFF',
          padding: 12,
          borderRadius: 8,
          alignItems: 'center',
        }}
      >
        <Text style={{ color: 'white', fontWeight: 'bold' }}>Clear Book Data</Text>
      </TouchableOpacity>
    </View>
  )
}
