import { registerRootComponent } from 'expo';
import React, { useState } from 'react';
import { View } from 'react-native';
import { registerGlobals } from '@livekit/react-native';
import App, { MEEiOpeningExperience } from './App';
import AuthGate from './AuthGate';

registerGlobals();

function Root() {
  const [openingDone, setOpeningDone] = useState(false);
  return (
    <View style={{ flex: 1 }}>
      <AuthGate><App /></AuthGate>
      {!openingDone && <MEEiOpeningExperience onComplete={() => setOpeningDone(true)} />}
    </View>
  );
}

registerRootComponent(Root);
