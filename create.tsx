import { View, Text, StyleSheet } from 'react-native';
import { theme } from './theme';
export default function Create() { return <View style={s.page}><Text style={s.title}>Create a post</Text><Text style={s.body}>Photo · Video · Text · Status</Text><Text style={s.note}>Post creation and media upload will be connected in the next build step.</Text></View>; }
const s=StyleSheet.create({page:{flex:1,backgroundColor:theme.bg,padding:24,paddingTop:70,gap:14},title:{color:theme.text,fontSize:28,fontWeight:'900'},body:{color:theme.cyan,fontSize:17,fontWeight:'700'},note:{color:theme.muted,lineHeight:22,backgroundColor:theme.panel,padding:18,borderRadius:16}});
