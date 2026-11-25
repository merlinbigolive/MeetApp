import { registerRootComponent } from 'expo';
import React from 'react';
import { registerGlobals } from '@livekit/react-native';
import App from './App';
import AuthGate from './AuthGate';

registerGlobals();

function Root() {
  return <AuthGate><App /></AuthGate>;
}

registerRootComponent(Root);
