#!/usr/bin/env bash
# Patches all TOPICAL RAWS products on the live Vercel deployment:
# - Fixes category "TOPICALS RAW" → "TOPICAL RAWS"
# - Adds productFunction description for each product
# Run AFTER deploying the new schema code.

BASE="https://deej-hauls.vercel.app/api/products"

patch() {
  local id=$1
  local name=$2
  local pricePerKit=$3
  local pricePerVial=$4
  local vialsPerKit=$5
  local handlingFee=$6
  local useCase=$7
  local productFunction=$8

  echo -n "Patching row $id: $name ... "
  STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PUT "$BASE/$id" \
    -H "Content-Type: application/json" \
    -d "{
      \"category\": \"TOPICAL RAWS\",
      \"productName\": \"$name\",
      \"pricePerKit\": $pricePerKit,
      \"pricePerVial\": $pricePerVial,
      \"vialsPerKit\": $vialsPerKit,
      \"handlingFee\": $handlingFee,
      \"active\": true,
      \"useCase\": \"$useCase\",
      \"productFunction\": \"$productFunction\"
    }")
  echo "$STATUS"
  sleep 0.3
}

# id | name | pricePerKit | pricePerVial | vialsPerKit | handlingFee | useCase | productFunction
patch 35 "PDRN 1g"                   1382  1382  1 150 "Skin Regeneration"          "Polynucleotide for DNA repair and skin tissue regeneration"
patch 36 "Myristoyl Tripeptide-31"   5944  5944  1 150 "Skin Regeneration"          "Stimulates type I/III collagen synthesis for skin repair"
patch 37 "AHK-CU 1g"                 703   703   1 150 "Carrier / Repair"           "Copper tripeptide supporting wound healing, scalp, and skin repair"
patch 38 "GHK-CU 1g"                 314   314   1 150 "Carrier / Repair"           "Copper peptide for skin renewal, antioxidant, and wound healing"
patch 39 "Human-like Collagen"       1916  1916  1 150 "Collagen / Skin Firming"    "Bioidentical recombinant collagen for hydration and structural firmness"
patch 40 "Matrixyl3000"              3517  3517  1 150 "Collagen / Skin Firming"    "Palmitoyl pentapeptide duo for wrinkle depth reduction and collagen boost"
patch 41 "Myristoyl Pentapeptide-4"  3614  3614  1 150 "Collagen / Skin Firming"    "Lipopeptide stimulating collagen I/III/IV and hyaluronic acid production"
patch 42 "Myristoyl Pentapeptide-8"  4973  4973  1 150 "Collagen / Skin Firming"    "Anti-aging lipopeptide improving skin thickness, elasticity, and firmness"
patch 43 "Biotinoyl Tripeptide-1"    3517  3517  1 150 "Lash & Brow Growth"         "Anchors follicles to dermis; stimulates keratinocyte growth for lash/brow density"
patch 44 "Myristoyl Pentapeptide-17" 4003  4003  1 150 "Lash & Brow Growth"         "Stimulates keratin and beta-catenin expression for longer, denser eyelashes"
patch 45 "Myristoyl Tetrapeptide-12" 4973  4973  1 150 "Lash & Brow Growth"         "Upregulates lash follicle growth factors and extracellular matrix proteins"
patch 46 "Myristoyl Hexapeptide-16"  4003  4003  1 150 "Lash & Brow Growth"         "Keratin gene-activating peptide for thicker, stronger lashes"
patch 47 "Acetyl Tetrapeptide-3"     3808  3808  1 150 "Hair Loss / Scalp"          "Anchors hair follicles to dermis; prevents miniaturization and thinning"
patch 48 "Eyeliss"                   2061  2061  1 150 "Eye Area"                   "Tripeptide complex reducing puffiness, capillary fragility, and dark circles"
patch 49 "Acetyl Dipeptide-3"        4342  4342  1 150 "Anti-Aging / Wrinkle"       "Neuromodulating peptide calming neuromuscular activity for expression lines"
patch 50 "Acetyl Hexapeptide-51"    14679 14679  1 150 "Anti-Aging / Wrinkle"       "Potent SNAP-25 inhibitor; Botox-like relaxation of dynamic wrinkles"
patch 51 "Tripeptide-32"             4196  4196  1 150 "Antioxidant / Anti-Glycation" "Inhibits AGE formation to protect collagen and elastin from sugar-induced aging"

echo ""
echo "Done. Verify: curl -s https://deej-hauls.vercel.app/api/products | python3 -m json.tool | grep -A2 'TOPICAL'"
