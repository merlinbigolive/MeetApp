import { ScrollView, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from '../../src/constants/theme';
export default function PublicFeed() {
  return <ScrollView style={s.page} contentContainerStyle={s.content}>
    <Text style={s.title}>Public Feed</Text><Text style={s.muted}>Discover what the Meetapp community is sharing.</Text>
    <View style={s.post}><View style={s.row}><View style={s.avatar}><Text style={s.avatarText}>M</Text></View><View style={{flex:1}}><Text style={s.name}>Meetapp Community <Text style={{color:theme.cyan}}>✓</Text></Text><Text style={s.muted}>@meetapp · Sample post</Text></View><Ionicons name="ellipsis-horizontal" color={theme.muted} size={22}/></View>
    <View style={s.media}><Ionicons name="image-outline" color={theme.muted} size={42}/><Text style={s.muted}>Photo or video post preview</Text></View>
    <Text style={s.body}>Your public posts will appear here. Follow creators, react and join conversations.</Text>
    <View style={s.actions}><Text style={s.action}>♡  Like</Text><Text style={s.action}>◯  Comment</Text><Text style={s.action}>↗  Share</Text></View></View>
  </ScrollView>;
}
const s=StyleSheet.create({page:{flex:1,backgroundColor:theme.bg},content:{padding:20,paddingTop:60,gap:8},title:{color:theme.text,fontSize:28,fontWeight:'900'},muted:{color:theme.muted},post:{backgroundColor:theme.panel,borderRadius:20,borderWidth:1,borderColor:theme.border,padding:14,marginTop:18,gap:14},row:{flexDirection:'row',alignItems:'center',gap:10},avatar:{width:42,height:42,borderRadius:21,backgroundColor:theme.panel2,alignItems:'center',justifyContent:'center'},avatarText:{color:theme.text,fontWeight:'800'},name:{color:theme.text,fontWeight:'800'},media:{height:250,borderRadius:14,backgroundColor:theme.panel2,alignItems:'center',justifyContent:'center',gap:8},body:{color:theme.text,lineHeight:21},actions:{flexDirection:'row',justifyContent:'space-between'},action:{color:theme.muted,fontWeight:'600'}});
