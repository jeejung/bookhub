import React from 'react'
import { SafeAreaView, StatusBar, useColorScheme } from 'react-native'

import { BarcodeScanner } from './src/BarcodeScanner'

export const App = (): React.JSX.Element => {
  const isDarkMode = useColorScheme() === 'dark'

  return (
    <SafeAreaView style={{ flex: 1 }}>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={'transparent'}
      />
      <BarcodeScanner />
    </SafeAreaView>
  )
}
