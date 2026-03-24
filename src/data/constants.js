// ── App Constants ──
import { _doctorUrgent, _newbornTeam } from '../utils/locale.js';

export const ICONS = {feed:"🍼",nap:"😴",wake:"☀️",sleep:"🌙",poop:"💩"};
export const NAMES = {feed:"Feed",nap:"Nap",wake:"Wake Up",sleep:"Bedtime",poop:"Nappy"};
export const POOP_TYPES = ["Yellow/seedy","Mustard","Green","Brown","Dark green","Orange","Black/tarry","White/pale","Mucousy","Watery","Formed/solid","Pellet-like","Frothy","Bloody/streaked","Meconium","Other"];
export const POOP_SAFETY_FLAGS = {
  "Black/tarry":`Black or tarry stools after the first few days may need medical attention — contact your ${_doctorUrgent}.`,
  "White/pale":`Persistently pale or chalky stools can indicate a liver condition — mention this to your ${_doctorUrgent} promptly.`,
  "Bloody/streaked":`Blood in stools can have many causes, but if new or persistent, contact your ${_doctorUrgent}.`,
  "Meconium":`Meconium (dark, sticky first stools) is normal in the first 48–72 hours. If still passing meconium after day 3–4, mention it to your ${_newbornTeam}.`
};
