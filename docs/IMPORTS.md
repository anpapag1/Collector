# Collector — Module Import Reference

## Navigation & Router
```ts
import { router, useLocalSearchParams, Stack } from 'expo-router';
```

## React Native Core
```ts
import {
  View, Text, ScrollView, TouchableOpacity, Pressable,
  StyleSheet, TextInput, Image, Animated,
  BackHandler, KeyboardAvoidingView, Platform,
} from 'react-native';
```

## Safe Area
```ts
import { useSafeAreaInsets } from 'react-native-safe-area-context';
```

## Linear Gradient
```ts
import { LinearGradient } from 'expo-linear-gradient';
```

## Icons
```ts
import { MaterialIcons } from '@expo/vector-icons';
// Usage: <MaterialIcons name="star" size={24} color="#006a60" />
```

## Fonts
```ts
import { useFonts } from 'expo-font';
import {
  Roboto_400Regular,
  Roboto_500Medium,
  Roboto_700Bold,
} from '@expo-google-fonts/roboto';
```

## Splash Screen
```ts
import * as SplashScreen from 'expo-splash-screen';
// SplashScreen.preventAutoHideAsync();
// SplashScreen.hideAsync();
```

## Status Bar
```ts
import { StatusBar } from 'expo-status-bar';
```

## Location / GPS
```ts
import * as Location from 'expo-location';
// Location.requestForegroundPermissionsAsync()
// Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High })
```

## Image Picker
```ts
import * as ImagePicker from 'expo-image-picker';
// ImagePicker.launchCameraAsync({ quality: 0.8 })
// ImagePicker.launchImageLibraryAsync({ quality: 0.8 })
```

## Document Picker
```ts
import * as DocumentPicker from 'expo-document-picker';
// DocumentPicker.getDocumentAsync({ type: 'application/json', copyToCacheDirectory: true })
```

## File System
```ts
import * as FileSystem from 'expo-file-system';
// FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 })
// FileSystem.writeAsStringAsync(path, data, { encoding: FileSystem.EncodingType.Base64 })
// FileSystem.cacheDirectory   → writable cache path
```

## Sharing
```ts
import * as Sharing from 'expo-sharing';
// Sharing.shareAsync(fileUri, { mimeType: 'application/zip', dialogTitle: '...' })
```

## ZIP
```ts
import JSZip from 'jszip';
// const zip = new JSZip();
// zip.file('entries.json', jsonString);
// zip.folder('images')!.file('photo.jpg', base64str, { base64: true });
// const b64 = await zip.generateAsync({ type: 'base64' });
```

## State Management
```ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
```

## Persistence
```ts
import AsyncStorage from '@react-native-async-storage/async-storage';
// Used as storage adapter for zustand persist middleware
```

## Internal Stores
```ts
import { useFormStore } from '../store/formStore';
import { useEntriesStore } from '../store/entriesStore';
```

## Internal Utils
```ts
import { loadBundledConfig, loadFromPath } from '../utils/schemaLoader';
import { captureLocation } from '../utils/sensors';
import { buildAndExport, exportFilename } from '../utils/exporter';
import { timeAgo, formatDate } from '../utils/timeUtils';
```

## Internal Types
```ts
import type { FormConfig, FieldDef, FieldType, Entry, EntryData, GpsLocation, PhotoItem } from '../types';
```

## Internal Components
```ts
import EntryCard from '../components/EntryCard';
import DynamicForm from '../components/DynamicForm';
import GpsField from '../components/fields/GpsField';
import TextField from '../components/fields/TextField';
import TextAreaField from '../components/fields/TextAreaField';
import SelectField from '../components/fields/SelectField';
import RatingField from '../components/fields/RatingField';
import ImageField from '../components/fields/ImageField';
```
