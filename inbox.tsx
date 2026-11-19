import { View, Text, StyleSheet } from 'react-native';
import { theme } from '../../src/constants/theme';
export default function Inbox() { return <View style={s.page}><Text style={s.title}>Inbox</Text><Text style={s.note}>Your private chats, groups, voice calls and video calls will appear here.</Text></View>; }
const s=StyleSheet.create({page:{flex:1,backgroundColor:theme.bg,padding:24,paddingTop:70,gap:16},title:{color:theme.text,fontSize:28,fontWeight:'900'},note:{color:theme.muted,lineHeight:22,backgroundColor:theme.panel,padding:18,borderRadius:16}});
