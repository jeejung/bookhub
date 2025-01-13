import React from 'react';
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  useColorScheme,
  View,
} from 'react-native';

import { BarcodeScanner } from './src/BarcodeScanner';

export const App = (): React.JSX.Element => {
  const isDarkMode = useColorScheme() === 'dark';

  return (
    <SafeAreaView>
      <StatusBar
        barStyle={isDarkMode ? 'light-content' : 'dark-content'}
        backgroundColor={'transparent'}
      />
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={{ flex: 1 }}>
          <Text>Bookhub</Text>
          <BarcodeScanner />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}