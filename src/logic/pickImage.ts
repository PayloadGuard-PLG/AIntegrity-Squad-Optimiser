import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';

export async function pickImage(): Promise<string | null> {
  const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (perm.status !== 'granted') {
    Alert.alert('Permission required', 'Allow access to your photo library to scan screenshots.');
    return null;
  }
  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: ['images'],
    // quality:1 = no JPEG recompression; allowsEditing:false = no crop/resize.
    // The original file URI is passed directly to ML Kit at native device resolution.
    quality: 1,
    allowsEditing: false,
    base64: false, // don't decode — pass URI directly for best performance
    exif: false,
  });
  if (result.canceled || result.assets.length === 0) return null;
  return result.assets[0].uri;
}
