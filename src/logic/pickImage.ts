import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

// Set to true while the picker is open so the privacy overlay is suppressed.
// AppState fires 'background' for the full duration the picker is open on Android.
export let pickingImage = false;

export async function pickImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    Alert.alert('Permission required', 'Allow access to your photo library to scan screenshots.');
    return null;
  }
  pickingImage = true;
  try {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 1,
      allowsEditing: false,
      base64: false,
      exif: false,
    });
    if (result.canceled || result.assets.length === 0) return null;
    return result.assets[0].uri;
  } finally {
    pickingImage = false;
  }
}
