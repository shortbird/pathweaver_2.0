import { View } from 'react-native';
import { cssInterop } from 'nativewind';

cssInterop(View, { className: 'style' });

export const Box = View;
