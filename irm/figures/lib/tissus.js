// ---------------------------------------------------------------------------
// Paramètres des tissus utilisés par TOUTES les figures interactives du livre.
//
// Valeurs typiques à 3 T (ordres de grandeur tirés de Wansapura 1999,
// Stanisz 2005, Gold 2004 ; voir 01-relaxation.md). T1, T2, T2s en ms.
// DP = densité de protons relative (LCR = 1). "couleur" = créneau de la
// palette catégorielle (voir lib/style.css : --t-<id>).
// ---------------------------------------------------------------------------
window.TISSUS = {
  "sb":  {"nom": "Substance blanche", "court": "SB",  "T1": 830,  "T2": 80,   "T2s": 50,  "DP": 0.70},
  "sg":  {"nom": "Substance grise",   "court": "SG",  "T1": 1330, "T2": 110,  "T2s": 60,  "DP": 0.82},
  "lcr": {"nom": "LCR",               "court": "LCR", "T1": 4000, "T2": 2000, "T2s": 500, "DP": 1.00},
  "gr":  {"nom": "Graisse",           "court": "Gr.", "T1": 380,  "T2": 130,  "T2s": 60,  "DP": 0.90},
  "les": {"nom": "Lésion (œdème)",    "court": "Lés.", "T1": 1500, "T2": 200,  "T2s": 120, "DP": 0.90},
  "mu":  {"nom": "Muscle",            "court": "Mu.", "T1": 1420, "T2": 32,   "T2s": 25,  "DP": 0.75}
};
