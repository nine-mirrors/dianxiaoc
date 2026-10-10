// <define:import.meta.env>
var define_import_meta_env_default = { VITE_API_MODE: "mock", VITE_DEMO_SPEED: "1", BASE_URL: "/" };

// src/fixtures/schema.ts
var SCHEMA_VERSION = "1.0";
function checkFixture(name, root) {
  const ok2 = root?.schemaVersion === SCHEMA_VERSION;
  if (!ok2) {
    console.warn(`[fixtures] ${name}.json \u7684 schemaVersion \u4E3A ${root?.schemaVersion}\uFF0C\u671F\u671B ${SCHEMA_VERSION}\uFF0C\u8BF7\u68C0\u67E5\u6570\u636E\u7ED3\u6784\u662F\u5426\u5DF2\u53D8\u66F4\u3002`);
  }
  return ok2;
}

// src/fixtures/users.json
var users_default = {
  schemaVersion: "1.0",
  items: [
    {
      id: "U_REP",
      name: "\u674E\u5F3A",
      role: "rep",
      avatarText: "\u674E",
      duty: "\u62CD\u8D27\u67B6 \xB7 AI\u8BCA\u65AD \xB7 \u62FF\u65B9\u6848",
      sub: "\u8F96\u533A 128 \u5BB6 \xB7 \u4ECA\u65E5\u5F85\u5DE1 5 \u5BB6",
      regionId: "R_EAST"
    },
    {
      id: "U_MGR",
      name: "\u738B\u654F",
      role: "manager",
      avatarText: "\u738B",
      duty: "\u770B\u677F / \u6D3E\u4EFB\u52A1",
      sub: "\u57CE\u4E1C\u7247\u533A \xB7 128 \u5BB6\u95E8\u5E97",
      regionId: "R_EAST"
    },
    {
      id: "U_OWNER",
      name: "\u5F20\u5927\u59D0",
      role: "owner",
      avatarText: "\u5F20",
      duty: "\u81EA\u52A9\u8BCA\u65AD / \u8BA2\u8D27",
      sub: "\u597D\u90BB\u5C45 \xB7 \u5730\u94C1\u53E3\u5E97\u5E97\u4E3B",
      regionId: "R_EAST"
    }
  ]
};

// src/fixtures/stores.json
var stores_default = {
  schemaVersion: "1.0",
  items: [
    {
      id: "S1",
      name: "\u5BB6\u5BB6\u60A6\xB7\u5B66\u5E9C\u8DEF\u5E97",
      type: "A",
      typeLabel: "A\u7C7B\u8FDE\u9501\u8D85\u5E02",
      address: "\u5B66\u5E9C\u8DEF 128 \u53F7 1F",
      ownerName: "\u5218\u5E97\u957F",
      distanceKm: 0.8,
      standard: { coldCols: 6, ambientCols: 12, stacks: 1 },
      photos: [
        { id: "P_S1_COLD", type: "cold", url: "/stores/S1/cold.jpg", caption: "\u51B7\u85CF\u67DC\u6B63\u9762" }
      ],
      lastScore: 91,
      prevScore: 87,
      alert: false
    },
    {
      id: "S2",
      name: "\u597D\u90BB\u5C45\xB7\u5730\u94C1\u53E3\u5E97",
      type: "C",
      typeLabel: "C\u7C7B\u4FBF\u5229\u5E97",
      address: "\u5730\u94C1 2 \u53F7\u7EBF C \u53E3\u5317\u4FA7 30m",
      ownerName: "\u5F20\u5927\u59D0",
      distanceKm: 1.5,
      standard: { coldCols: 3, ambientCols: 5, stacks: 0 },
      photos: [
        { id: "P_S2_COLD", type: "cold", url: "/stores/S2/cold.jpg", caption: "\u51B7\u85CF\u67DC\u6B63\u9762\uFF08\u6574\u6539\u540E\uFF09" },
        { id: "P_S2_COLD_BEFORE", type: "cold", url: "/stores/S2/cold_before.jpg", caption: "\u51B7\u85CF\u67DC\u6B63\u9762\uFF08\u6574\u6539\u524D\uFF09" }
      ],
      lastScore: 80,
      prevScore: 48,
      alert: false
    },
    {
      id: "S3",
      name: "\u7F8E\u5B9C\u4F73\xB7\u57CE\u5EFA\u5B66\u9662\u5E97",
      type: "C",
      typeLabel: "C\u7C7B\u4FBF\u5229\u5E97",
      address: "\u57CE\u5EFA\u5B66\u9662\u5357\u95E8\u5BF9\u9762 50m",
      ownerName: "\u9648\u5E97\u957F",
      distanceKm: 0.3,
      standard: { coldCols: 4, ambientCols: 5, stacks: 0 },
      photos: [
        { id: "P_S3_COLD", type: "cold", url: "/stores/S3/cold.jpg", caption: "\u51B7\u85CF\u67DC\u6B63\u9762" },
        { id: "P_S3_AMBIENT", type: "ambient", url: "/stores/S3/ambient.jpg", caption: "\u5E38\u6E29\u8D27\u67B6" },
        { id: "P_S3_STACK", type: "stack", url: "/stores/S3/stack.jpg", caption: "\u5806\u5934 / \u7AEF\u67B6" }
      ],
      lastScore: 72,
      prevScore: 72,
      alert: false
    },
    {
      id: "S4",
      name: "\u534E\u8054\u8D85\u5E02\xB7\u4E07\u8FBE\u5E97",
      type: "B",
      typeLabel: "B\u7C7B\u5927\u5356\u573A",
      address: "\u4E07\u8FBE\u5E7F\u573A B1 \u5C42\u8D85\u5E02\u5165\u53E3",
      ownerName: "\u8D75\u5E97\u957F",
      distanceKm: 1.2,
      standard: { coldCols: 4, ambientCols: 8, stacks: 1 },
      photos: [
        { id: "P_S4_COLD", type: "cold", url: "/stores/S4/cold.jpg", caption: "\u51B7\u85CF\u67DC\u6B63\u9762" }
      ],
      lastScore: 64,
      prevScore: 62,
      alert: false
    },
    {
      id: "S5",
      name: "\u6C38\u8F89\u751F\u6D3B\xB7\u4E2D\u592E\u516C\u56ED\u5E97",
      type: "B",
      typeLabel: "B\u7C7B\u793E\u533A\u751F\u9C9C",
      address: "\u4E2D\u592E\u516C\u56ED\u4E1C\u95E8 1F \u5546\u94FA",
      ownerName: "\u5B59\u5E97\u957F",
      distanceKm: 2.6,
      standard: { coldCols: 4, ambientCols: 8, stacks: 1 },
      photos: [
        { id: "P_S5_COLD", type: "cold", url: "/stores/S5/cold.jpg", caption: "\u51B7\u85CF\u67DC\u6B63\u9762" }
      ],
      lastScore: 43,
      prevScore: 46,
      alert: true
    }
  ]
};

// src/fixtures/skus.json
var skus_default = {
  schemaVersion: "1.0",
  items: [
    { id: "SKU_001", name: "\u4F18\u76CAC 100ml", brand: "\u8499\u725B", spec: "100ml\xD75", guidePrice: 4 },
    { id: "SKU_002", name: "\u4F18\u76CAC \u539F\u5473 450g", brand: "\u8499\u725B", spec: "450g", guidePrice: 4 },
    { id: "SKU_003", name: "\u51A0\u76CA\u4E73 250g", brand: "\u8499\u725B", spec: "250g\xD74", guidePrice: 5.5 },
    { id: "SKU_004", name: "\u51A0\u76CA\u4E73 \u676F\u88C5 100g", brand: "\u8499\u725B", spec: "100g\xD78", guidePrice: 3.5 },
    { id: "SKU_005", name: "\u7EAF\u7504\u5E38\u6E29\u9178\u5976", brand: "\u8499\u725B", spec: "200g\xD712", guidePrice: 4.5 },
    { id: "SKU_006", name: "\u771F\u679C\u7C92 250ml", brand: "\u8499\u725B", spec: "250ml\xD712", guidePrice: 4 },
    { id: "SKU_007", name: "\u4F18\u76CAC \u539F\u5473", brand: "\u8499\u725B", spec: "100ml\xD75 \u6574\u63D0", guidePrice: 4 },
    { id: "SKU_008", name: "\u4F18\u76CAC \u82A6\u835F\u5473", brand: "\u8499\u725B", spec: "100ml\xD75", guidePrice: 4 },
    { id: "SKU_009", name: "\u7279\u4ED1\u82CF 250ml", brand: "\u8499\u725B", spec: "250ml\xD712", guidePrice: 5 },
    { id: "SKU_101", name: "\u5473\u5168 332ml", brand: "\u5473\u5168", spec: "332ml", guidePrice: 3.5 },
    { id: "SKU_102", name: "\u517B\u4E50\u591A 100ml", brand: "\u517B\u4E50\u591A", spec: "100ml\xD75", guidePrice: 2.5 },
    { id: "SKU_103", name: "\u4F0A\u5229\u6BCF\u76CA\u6DFB", brand: "\u4F0A\u5229", spec: "100ml\xD75", guidePrice: 3.8 }
  ]
};

// src/fixtures/visits.json
var visits_default = {
  schemaVersion: "1.0",
  items: [
    {
      id: "V_S1_001",
      storeId: "S1",
      storeName: "\u5BB6\u5BB6\u60A6\xB7\u5B66\u5E9C\u8DEF\u5E97",
      repId: "U_REP",
      visitedAt: "2026-10-02 09:12",
      visitNo: 8,
      photoIds: ["P_S1_COLD"],
      score: 91,
      status: "done"
    },
    {
      id: "V_S2_002",
      storeId: "S2",
      storeName: "\u597D\u90BB\u5C45\xB7\u5730\u94C1\u53E3\u5E97",
      repId: "U_REP",
      visitedAt: "2026-10-02 10:05",
      visitNo: 6,
      photoIds: ["P_S2_COLD"],
      score: 80,
      status: "done"
    },
    {
      id: "V_S2_001",
      storeId: "S2",
      storeName: "\u597D\u90BB\u5C45\xB7\u5730\u94C1\u53E3\u5E97",
      repId: "U_REP",
      visitedAt: "2026-09-25 15:40",
      visitNo: 5,
      photoIds: ["P_S2_COLD_BEFORE"],
      score: 48,
      status: "done"
    },
    {
      id: "V_S3_001",
      storeId: "S3",
      storeName: "\u7F8E\u5B9C\u4F73\xB7\u57CE\u5EFA\u5B66\u9662\u5E97",
      repId: "U_REP",
      visitedAt: "2026-09-25 11:20",
      visitNo: 5,
      photoIds: ["P_S3_COLD"],
      score: 72,
      status: "done"
    },
    {
      id: "V_S4_001",
      storeId: "S4",
      storeName: "\u534E\u8054\u8D85\u5E02\xB7\u4E07\u8FBE\u5E97",
      repId: "U_REP",
      visitedAt: "2026-09-25 14:05",
      visitNo: 4,
      photoIds: ["P_S4_COLD"],
      score: 64,
      status: "done"
    },
    {
      id: "V_S5_001",
      storeId: "S5",
      storeName: "\u6C38\u8F89\u751F\u6D3B\xB7\u4E2D\u592E\u516C\u56ED\u5E97",
      repId: "U_REP",
      visitedAt: "2026-09-25 16:30",
      visitNo: 7,
      photoIds: ["P_S5_COLD"],
      score: 43,
      status: "alert"
    }
  ]
};

// src/fixtures/diagnoses.json
var diagnoses_default = {
  schemaVersion: "1.0",
  defaultSteps: [
    { text: "\u6B63\u5728\u4E0A\u4F20\u8D27\u67B6\u7167\u7247\u2026", delayMs: 480 },
    { text: "\u5DF2\u8BC6\u522B 14 \u4E2A\u76EE\u6807\uFF1ASKU 8 / \u7A7A\u4F4D 1 / \u7ADE\u54C1 2 / \u4EF7\u7B7E 3", delayMs: 480 },
    { text: "\u6B63\u5728\u6BD4\u5BF9\u300CC \u7C7B\u4FBF\u5229\u5E97\u9648\u5217\u6807\u51C6\u300D\u2026", delayMs: 480 },
    { text: "\u6B63\u5728\u7ED3\u5408\u8FD1 4 \u5468\u52A8\u9500\u6570\u636E\u63A8\u7406\u2026", delayMs: 480 },
    { text: "\u8BCA\u65AD\u5B8C\u6210", delayMs: 480 }
  ],
  items: [
    {
      key: "S3",
      storeId: "S3",
      storeName: "\u7F8E\u5B9C\u4F73\xB7\u57CE\u5EFA\u5B66\u9662\u5E97",
      visitId: "V_S3_001",
      createdAt: "2026-10-02 10:24",
      visitNo: 6,
      photoUrl: "/stores/S3/cold.jpg",
      shootTypes: ["cold"],
      dimensions: [76, 68, 70, 62, 82, 85],
      scoreOverride: null,
      prevScore: 72,
      expectedScore: 89,
      summary: {
        total: 14,
        skuCount: 8,
        emptyCount: 1,
        competitorCount: 2,
        priceTagCount: 3,
        stackCount: 1,
        text: "\u2726 AI \u8BC6\u522B\u6458\u8981\uFF1A\u8499\u725BSKU 8 \u9879 / \u7A7A\u4F4D 1 / \u7ADE\u54C1\u5360\u4F4D 2 / \u4EF7\u7B7E\u95EE\u9898 3 / \u5806\u5934\u672A\u6267\u884C 1"
      },
      annotations: [
        { id: "A01", layer: "mengniu", x: 3, y: 9, w: 47, h: 12, label: "\u4F18\u76CAC \u539F\u5473 \u2714\u6B63\u5E38", skuId: "SKU_007" },
        { id: "A02", layer: "mengniu", x: 3, y: 27, w: 27, h: 13, label: "\u4F18\u76CAC 100ml \u2714\u6EE1\u6392", skuId: "SKU_001" },
        { id: "A03", layer: "oos", x: 30, y: 27, w: 18, h: 13, label: "\u4F18\u76CAC 450g \u25B3\u4EC5\u5269 3 \u74F6", skuId: "SKU_002" },
        { id: "A04", layer: "empty", x: 48, y: 27, w: 28, h: 13, label: "\u7A7A\u4F4D \u2716\u7F3A\u8D27", skuId: "SKU_001" },
        { id: "A05", layer: "competitor", x: 76, y: 27, w: 17, h: 13, label: "\u5473\u5168 \u26A0\u7ADE\u54C1\u5360\u4F4D", skuId: "SKU_101" },
        { id: "A06", layer: "mengniu", x: 3, y: 44, w: 37, h: 13, label: "\u51A0\u76CA\u4E73 250g \u2714\u6B63\u5E38", skuId: "SKU_003" },
        { id: "A07", layer: "oos", x: 40, y: 44, w: 20, h: 13, label: "\u771F\u679C\u7C92 \u25B3\u7F3A 1 \u5217", skuId: "SKU_006" },
        { id: "A08", layer: "competitor", x: 60, y: 44, w: 32, h: 13, label: "\u517B\u4E50\u591A \u26A0\u7ADE\u54C1\u5360\u4F4D", skuId: "SKU_102" },
        { id: "A09", layer: "oos", x: 3, y: 60, w: 37, h: 13, label: "\u7EAF\u7504\u5E38\u6E29 \u25B3\u88AB\u6324\u81F3\u4E0B\u5C42", skuId: "SKU_005" },
        { id: "A10", layer: "oos", x: 40, y: 60, w: 12, h: 13, label: "\u51A0\u76CA\u4E73\u676F\u88C5 \u25B3\u9648\u5217\u8FC7\u6DF1", skuId: "SKU_004" },
        { id: "A11", layer: "mengniu", x: 3, y: 76, w: 42, h: 13, label: "\u4F18\u76CAC \u82A6\u835F\u5473 \u2714\u6392\u9762\u8FBE\u6807", skuId: "SKU_008" },
        { id: "A12", layer: "pricetag", x: 3, y: 37.5, w: 18, h: 5, label: "\u2716 \u4EF7\u7B7E\u7F3A\u5931", skuId: "SKU_001" },
        { id: "A13", layer: "pricetag", x: 30, y: 37.5, w: 20, h: 5, label: "\u25B3 3.5\u5143 \u2260 \u6807\u51C6 4.0\u5143", skuId: "SKU_002" },
        { id: "A14", layer: "pricetag", x: 3, y: 54.5, w: 18, h: 5, label: "\u2716 \u4EF7\u7B7E\u7F3A\u5931", skuId: "SKU_003" }
      ],
      issues: [
        {
          id: "IS1",
          severity: "severe",
          title: "\u51B7\u67DC\u7B2C 2 \u5C42\u7B2C 3 \u5217\u6574\u5217\u7F3A\u8D27",
          location: "\u51B7\u85CF\u67DC \xB7 \u5E94\u9648\u5217 \u4F18\u76CAC 100ml",
          impact: "\u5F71\u54CD\uFF1A\u65E5\u5747\u7EA6 3.9 \u74F6\u9500\u91CF\u6D41\u5931",
          actions: ["\u8865\u8D27 12 \u74F6", "\u6807\u8BB0\u5DF2\u5904\u7406"],
          relatedAnnotationIds: ["A04", "A02"]
        },
        {
          id: "IS2",
          severity: "severe",
          title: "\u7ADE\u54C1\u5473\u5168\u5360\u4F4D 1 \u4E2A\u9EC4\u91D1\u5217\u4F4D",
          location: "\u51B7\u85CF\u67DC\u7B2C 2 \u5C42 \xB7 \u8499\u725B\u6392\u9762\u88AB\u6324\u538B",
          impact: "\u5F71\u54CD\uFF1A\u9EC4\u91D1\u89C6\u7EBF\u5C42\u52A8\u9500\u635F\u5931\u7EA6 2.1 \u500D",
          actions: ["\u67E5\u770B\u7ADE\u4E89\u8BDD\u672F"],
          relatedAnnotationIds: ["A05"]
        },
        {
          id: "IS3",
          severity: "medium",
          title: "\u4EF7\u7B7E\u7F3A\u5931 2 \u5904 / \u4EF7\u683C\u4E0D\u7B26 1 \u5904",
          location: "\u51B7\u85CF\u67DC\u7B2C 2 \u5C42\u3001\u7B2C 3 \u5C42 \xB7 \u4F18\u76CAC / \u51A0\u76CA\u4E73",
          impact: "\u4F18\u76CAC \u6807 3.5 \u5143\uFF0C\u6807\u51C6\u4EF7 4.0 \u5143",
          actions: ["\u6253\u5370\u4EF7\u7B7E"],
          relatedAnnotationIds: ["A12", "A13", "A14"]
        },
        {
          id: "IS4",
          severity: "medium",
          title: "\u672C\u6708\u8054\u5408\u5806\u5934\u672A\u6267\u884C",
          location: "\u95E8\u5E97\u5165\u53E3\u533A \xB7 \u6D3B\u52A8\uFF1A\u51A0\u76CA\u4E73 \xD7 \u4F18\u76CAC \u53CC\u54C1\u5806\u5934",
          impact: "\u5F71\u54CD\uFF1A\u6D3B\u52A8\u671F\u7EA6\u635F\u5931 \xA5260 \u589E\u91CF\u9500\u552E",
          actions: ["\u7533\u8BF7\u7269\u6599"],
          relatedAnnotationIds: []
        }
      ],
      risk: {
        weeklyBottles: 27,
        weeklyAmount: 108,
        monthlyBottles: 117,
        monthlyAmount: 468,
        items: [
          {
            skuId: "SKU_001",
            skuName: "\u4F18\u76CAC 100ml",
            dailyAvgSales: 11,
            stdFacings: 4,
            actualFacings: 2.5,
            gapRatio: 0.375,
            elasticity: 0.35,
            dailyLossBottles: 3.9,
            unitPrice: 4
          }
        ],
        derivation: "\u2460 \u6392\u9762\u7F3A\u53E3\uFF1A\u540C\u7C7B C \u7C7B\u5E97\u51B7\u67DC\u6807\u51C6\u6392\u9762 4 \u5217\uFF0C\u672C\u5E97\u9EC4\u91D1\u5C42\uFF08\u7B2C 2 \u5C42\uFF0C\u79BB\u5730 1.2\u20131.6m\uFF09\u8499\u725B\u5B9E\u9645\u6709\u6548\u6392\u9762 2.5 \u5217 \u2192 \u7F3A\u53E3\u5360\u6BD4 (4 \u2212 2.5) \xF7 4 = 37.5%\n\u2461 \u52A8\u9500\u57FA\u51C6\uFF1A\u4F18\u76CAC 100ml \u8FD1 4 \u5468\u65E5\u5747\u52A8\u9500 11 \u74F6/\u5929\n\u2462 \u5F39\u6027\u5047\u8BBE\uFF1A\u6BCF\u51CF\u5C11 1 \u5217\u6392\u9762 \u2248 \u635F\u5931 35% \u5355\u5217\u52A8\u9500\uFF08\u884C\u4E1A\u53E3\u5F84\u6392\u9762\u5F39\u6027\u7CFB\u6570 0.35\uFF09\n\u2463 \u65E5\u5747\u6F5C\u5728\u635F\u5931 = 11 \xD7 37.5% \xD7 0.35 \u2248 3.9 \u74F6/\u5929\n\u2464 \u672C\u5468\u9884\u8BA1\u6D41\u5931 = 3.9 \xD7 7 \u2248 27 \u74F6\uFF1B\u6309\u96F6\u552E\u6307\u5BFC\u4EF7 \xA54.0/\u74F6 \u2192 \u7EA6 \xA5108\n\u2465 \u6708\u5EA6\u9884\u8BA1\u6D41\u5931 = 27 \xD7 4.3 \u2248 117 \u74F6 \u2192 \u7EA6 \xA5468\n\u5047\u8BBE\u8BF4\u660E\uFF1A\u9ED8\u8BA4\u5BA2\u6D41\u4E0E\u8FD1 4 \u5468\u6301\u5E73\u3001\u671F\u95F4\u4E0D\u8865\u8D27\u4E14\u4E0D\u8C03\u6574\u9648\u5217\uFF1B\u82E5\u672C\u5468\u5B8C\u6210\u8865\u8D27\u5E76\u62FF\u56DE\u9EC4\u91D1\u5217\u4F4D\uFF0C\u9884\u8BA1\u53EF\u633D\u56DE\u5176\u4E2D\u7EA6 70% \u7684\u635F\u5931\u3002"
      },
      plan: {
        storeTypeLabel: "\u8BE5\u5E97\u7C7B\u578B\u4E3A C\u7C7B\u4FBF\u5229",
        restock: [
          { skuId: "SKU_001", skuName: "\u4F18\u76CAC 100ml", bottles: 12, amount: 48 },
          { skuId: "SKU_002", skuName: "\u4F18\u76CAC \u539F\u5473 450g", bottles: 9, amount: 36 },
          { skuId: "SKU_006", skuName: "\u771F\u679C\u7C92 250ml", bottles: 6, amount: 24 }
        ],
        placement: [
          { text: "\u4F18\u76CAC \u4E0A\u79FB\u81F3\u51B7\u67DC\u7B2C 2 \u5C42\u7B2C 3 \u5217\uFF08\u9EC4\u91D1\u89C6\u7EBF\u5C42 1.2\u20131.6m\uFF09" },
          { text: "\u5E38\u6E29\u7EAF\u7504\u8C03\u56DE\u7B2C 1 \u5C42\uFF0C\u4E0E\u89C6\u7EBF\u9F50\u5E73" }
        ],
        totalBottles: 36,
        totalAmount: 144,
        coverDays: 3
      }
    },
    {
      key: "S1",
      storeId: "S1",
      storeName: "\u5BB6\u5BB6\u60A6\xB7\u5B66\u5E9C\u8DEF\u5E97",
      visitId: "V_S1_001",
      createdAt: "2026-10-02 09:12",
      visitNo: 8,
      photoUrl: "/stores/S1/cold.jpg",
      shootTypes: ["cold"],
      dimensions: [92, 95, 85, 88, 90, 90],
      scoreOverride: null,
      prevScore: 87,
      expectedScore: 96,
      summary: {
        total: 3,
        skuCount: 3,
        emptyCount: 0,
        competitorCount: 0,
        priceTagCount: 1,
        stackCount: 0,
        text: "\u2726 AI \u8BC6\u522B\u6458\u8981\uFF1A\u8499\u725BSKU 3 \u9879 / \u7A7A\u4F4D 0 / \u7ADE\u54C1\u5360\u4F4D 0 / \u4EF7\u7B7E\u95EE\u9898 1 / \u5806\u5934\u672A\u6267\u884C 0"
      },
      annotations: [
        { id: "B01", layer: "mengniu", x: 3, y: 9, w: 47, h: 12, label: "\u4F18\u76CAC \u539F\u5473 \u2714\u6EE1\u6392", skuId: "SKU_007" },
        { id: "B02", layer: "mengniu", x: 3, y: 27, w: 70, h: 13, label: "\u4F18\u76CAC 100ml \u2714\u6EE1\u6392", skuId: "SKU_001" },
        { id: "B03", layer: "pricetag", x: 3, y: 37.5, w: 18, h: 5, label: "\u2716 \u4EF7\u7B7E\u7F3A\u5931", skuId: "SKU_007" }
      ],
      issues: [
        {
          id: "IS1",
          severity: "low",
          title: "\u5E38\u6E29\u67B6 1 \u5904\u4EF7\u7B7E\u8F7B\u5EA6\u7F3A\u5931",
          location: "\u5E38\u6E29\u8D27\u67B6 \xB7 \u5E94\u9648\u5217 \u7279\u4ED1\u82CF 250ml",
          impact: "\u5F71\u54CD\uFF1A\u6682\u65E0\u9500\u91CF\u635F\u5931",
          actions: ["\u6253\u5370\u4EF7\u7B7E"],
          relatedAnnotationIds: ["B03"]
        }
      ],
      risk: {
        weeklyBottles: 6,
        weeklyAmount: 30,
        monthlyBottles: 26,
        monthlyAmount: 130,
        items: [
          {
            skuId: "SKU_009",
            skuName: "\u7279\u4ED1\u82CF 250ml",
            dailyAvgSales: 8,
            stdFacings: 6,
            actualFacings: 5,
            gapRatio: 0.167,
            elasticity: 0.35,
            dailyLossBottles: 0.9,
            unitPrice: 5
          }
        ],
        derivation: "\u2460 \u6392\u9762\u7F3A\u53E3\uFF1AA \u7C7B\u5E97\u5E38\u6E29\u6807\u51C6\u6392\u9762 6 \u5217\uFF0C\u5B9E\u9645\u6709\u6548 5 \u5217 \u2192 \u7F3A\u53E3\u5360\u6BD4 (6 \u2212 5) \xF7 6 = 16.7%\n\u2461 \u52A8\u9500\u57FA\u51C6\uFF1A\u7279\u4ED1\u82CF 250ml \u8FD1 4 \u5468\u65E5\u5747\u52A8\u9500 8 \u74F6/\u5929\n\u2462 \u5F39\u6027\u5047\u8BBE\uFF1A\u6392\u9762\u5F39\u6027\u7CFB\u6570 0.35\n\u2463 \u65E5\u5747\u6F5C\u5728\u635F\u5931 = 8 \xD7 16.7% \xD7 0.35 \u2248 0.5 \u74F6/\u5929\uFF0C\u53E0\u52A0\u4FC3\u9500\u4F4D\u5468\u8F6C\u635F\u8017\u53D6 0.9 \u74F6/\u5929\n\u2464 \u672C\u5468\u9884\u8BA1\u6D41\u5931 \u2248 6 \u74F6\uFF1B\u6309\u96F6\u552E\u6307\u5BFC\u4EF7 \xA55.0/\u74F6 \u2192 \u7EA6 \xA530\n\u2465 \u6708\u5EA6\u9884\u8BA1\u6D41\u5931 = 6 \xD7 4.3 \u2248 26 \u74F6 \u2192 \u7EA6 \xA5130"
      },
      plan: {
        storeTypeLabel: "\u8BE5\u5E97\u7C7B\u578B\u4E3A A\u7C7B\u8FDE\u9501\u8D85\u5E02",
        restock: [{ skuId: "SKU_009", skuName: "\u7279\u4ED1\u82CF 250ml", bottles: 6, amount: 30 }],
        placement: [{ text: "\u7279\u4ED1\u82CF\u4FDD\u6301\u51B7\u67DC\u7B2C 3 \u5C42\u89C6\u5E73\u7EBF\u9648\u5217\uFF0C\u7EF4\u6301 6 \u5217\u6EE1\u6392" }],
        totalBottles: 6,
        totalAmount: 30,
        coverDays: 2
      }
    },
    {
      key: "S2",
      storeId: "S2",
      storeName: "\u597D\u90BB\u5C45\xB7\u5730\u94C1\u53E3\u5E97",
      visitId: "V_S2_002",
      createdAt: "2026-10-02 10:05",
      visitNo: 6,
      photoUrl: "/stores/S2/cold.jpg",
      shootTypes: ["cold"],
      dimensions: [82, 80, 78, 72, 85, 90],
      scoreOverride: null,
      prevScore: 48,
      expectedScore: 88,
      summary: {
        total: 4,
        skuCount: 4,
        emptyCount: 0,
        competitorCount: 0,
        priceTagCount: 1,
        stackCount: 0,
        text: "\u2726 AI \u8BC6\u522B\u6458\u8981\uFF1A\u8499\u725BSKU 4 \u9879 / \u7A7A\u4F4D 0 / \u7ADE\u54C1\u5360\u4F4D 0 / \u4EF7\u7B7E\u95EE\u9898 1 / \u5806\u5934\u672A\u6267\u884C 0"
      },
      annotations: [
        { id: "C01", layer: "mengniu", x: 3, y: 9, w: 47, h: 12, label: "\u4F18\u76CAC \u539F\u5473 \u2714\u6EE1\u6392", skuId: "SKU_007" },
        { id: "C02", layer: "mengniu", x: 3, y: 27, w: 60, h: 13, label: "\u4F18\u76CAC 100ml \u27143 \u5217\u6EE1\u6392", skuId: "SKU_001" },
        { id: "C03", layer: "mengniu", x: 3, y: 44, w: 40, h: 13, label: "\u771F\u679C\u7C92 \u2714\u6392\u9762\u8FBE\u6807", skuId: "SKU_006" },
        { id: "C04", layer: "pricetag", x: 3, y: 37.5, w: 18, h: 5, label: "\u2716 \u4EF7\u7B7E\u7F3A\u5931", skuId: "SKU_006" }
      ],
      issues: [
        {
          id: "IS1",
          severity: "low",
          title: "\u771F\u679C\u7C92\u4EF7\u7B7E\u7F3A\u5931 1 \u5904",
          location: "\u51B7\u85CF\u67DC\u7B2C 3 \u5C42 \xB7 \u771F\u679C\u7C92 250ml",
          impact: "\u5F71\u54CD\uFF1A\u6682\u65E0\u9500\u91CF\u635F\u5931",
          actions: ["\u6253\u5370\u4EF7\u7B7E"],
          relatedAnnotationIds: ["C04"]
        }
      ],
      risk: {
        weeklyBottles: 8,
        weeklyAmount: 32,
        monthlyBottles: 34,
        monthlyAmount: 136,
        items: [
          {
            skuId: "SKU_001",
            skuName: "\u4F18\u76CAC 100ml",
            dailyAvgSales: 9,
            stdFacings: 3,
            actualFacings: 2.6,
            gapRatio: 0.133,
            elasticity: 0.35,
            dailyLossBottles: 1.1,
            unitPrice: 4
          }
        ],
        derivation: "\u2460 \u6392\u9762\u7F3A\u53E3\uFF1AC \u7C7B\u5E97\u51B7\u67DC\u6807\u51C6 3 \u5217\uFF0C\u5B9E\u9645\u6709\u6548 2.6 \u5217 \u2192 \u7F3A\u53E3\u5360\u6BD4 (3 \u2212 2.6) \xF7 3 = 13.3%\n\u2461 \u52A8\u9500\u57FA\u51C6\uFF1A\u4F18\u76CAC 100ml \u8FD1 4 \u5468\u65E5\u5747\u52A8\u9500 9 \u74F6/\u5929\n\u2462 \u5F39\u6027\u5047\u8BBE\uFF1A\u6392\u9762\u5F39\u6027\u7CFB\u6570 0.35\n\u2463 \u65E5\u5747\u6F5C\u5728\u635F\u5931 \u2248 1.1 \u74F6/\u5929\n\u2464 \u672C\u5468\u9884\u8BA1\u6D41\u5931 \u2248 8 \u74F6\uFF1B\u6309\u96F6\u552E\u6307\u5BFC\u4EF7 \xA54.0/\u74F6 \u2192 \u7EA6 \xA532\n\u2465 \u6708\u5EA6\u9884\u8BA1\u6D41\u5931 = 8 \xD7 4.3 \u2248 34 \u74F6 \u2192 \u7EA6 \xA5136"
      },
      plan: {
        storeTypeLabel: "\u8BE5\u5E97\u7C7B\u578B\u4E3A C\u7C7B\u4FBF\u5229",
        restock: [{ skuId: "SKU_001", skuName: "\u4F18\u76CAC 100ml", bottles: 6, amount: 24 }],
        placement: [{ text: "\u4FDD\u6301\u51B7\u67DC\u7B2C 2 \u5C42\u9EC4\u91D1\u4F4D 3 \u5217\u6EE1\u6392" }],
        totalBottles: 6,
        totalAmount: 24,
        coverDays: 2
      }
    },
    {
      key: "S2_BEFORE",
      storeId: "S2",
      storeName: "\u597D\u90BB\u5C45\xB7\u5730\u94C1\u53E3\u5E97",
      visitId: "V_S2_001",
      createdAt: "2026-09-25 15:40",
      visitNo: 5,
      photoUrl: "/stores/S2/cold_before.jpg",
      shootTypes: ["cold"],
      dimensions: [50, 30, 60, 45, 40, 65],
      scoreOverride: 48,
      prevScore: 44,
      expectedScore: 80,
      summary: {
        total: 6,
        skuCount: 3,
        emptyCount: 2,
        competitorCount: 1,
        priceTagCount: 2,
        stackCount: 0,
        text: "\u2726 AI \u8BC6\u522B\u6458\u8981\uFF1A\u8499\u725BSKU 3 \u9879 / \u7A7A\u4F4D 2 / \u7ADE\u54C1\u5360\u4F4D 1 / \u4EF7\u7B7E\u95EE\u9898 2 / \u5806\u5934\u672A\u6267\u884C 0"
      },
      annotations: [
        { id: "D01", layer: "mengniu", x: 3, y: 9, w: 30, h: 12, label: "\u4F18\u76CAC \u539F\u5473 \u2714\u6B63\u5E38", skuId: "SKU_007" },
        { id: "D02", layer: "empty", x: 33, y: 27, w: 25, h: 13, label: "\u7A7A\u4F4D \u2716\u7F3A\u8D27", skuId: "SKU_001" },
        { id: "D03", layer: "empty", x: 58, y: 27, w: 20, h: 13, label: "\u7A7A\u4F4D \u2716\u7F3A\u8D27", skuId: "SKU_001" },
        { id: "D04", layer: "competitor", x: 78, y: 27, w: 15, h: 13, label: "\u6BCF\u76CA\u6DFB \u26A0\u7ADE\u54C1\u5360\u4F4D", skuId: "SKU_103" },
        { id: "D05", layer: "pricetag", x: 3, y: 37.5, w: 18, h: 5, label: "\u2716 \u4EF7\u7B7E\u7F3A\u5931", skuId: "SKU_007" },
        { id: "D06", layer: "pricetag", x: 33, y: 37.5, w: 18, h: 5, label: "\u2716 \u4EF7\u7B7E\u7F3A\u5931", skuId: "SKU_001" }
      ],
      issues: [
        {
          id: "IS1",
          severity: "severe",
          title: "\u51B7\u67DC\u7B2C 2 \u5C42\u8FDE\u7EED 2 \u5217\u7F3A\u8D27",
          location: "\u51B7\u85CF\u67DC \xB7 \u5E94\u9648\u5217 \u4F18\u76CAC 100ml",
          impact: "\u5F71\u54CD\uFF1A\u65E5\u5747\u7EA6 8.3 \u74F6\u9500\u91CF\u6D41\u5931",
          actions: ["\u8865\u8D27 18 \u74F6"],
          relatedAnnotationIds: ["D02", "D03"]
        },
        {
          id: "IS2",
          severity: "severe",
          title: "\u7ADE\u54C1\u6BCF\u76CA\u6DFB\u5360\u4F4D 1 \u4E2A\u9EC4\u91D1\u5217\u4F4D",
          location: "\u51B7\u85CF\u67DC\u7B2C 2 \u5C42 \xB7 \u8499\u725B\u6392\u9762\u88AB\u6324\u538B",
          impact: "\u5F71\u54CD\uFF1A\u9EC4\u91D1\u89C6\u7EBF\u5C42\u52A8\u9500\u635F\u5931\u7EA6 2.1 \u500D",
          actions: ["\u67E5\u770B\u7ADE\u4E89\u8BDD\u672F"],
          relatedAnnotationIds: ["D04"]
        },
        {
          id: "IS3",
          severity: "medium",
          title: "\u4EF7\u7B7E\u7F3A\u5931 2 \u5904",
          location: "\u51B7\u85CF\u67DC\u7B2C 1 \u5C42\u3001\u7B2C 2 \u5C42",
          impact: "\u5F71\u54CD\uFF1A\u987E\u5BA2\u65E0\u6CD5\u6BD4\u4EF7\uFF0C\u8F6C\u5316\u7387\u4E0B\u964D",
          actions: ["\u6253\u5370\u4EF7\u7B7E"],
          relatedAnnotationIds: ["D05", "D06"]
        },
        {
          id: "IS4",
          severity: "medium",
          title: "\u5E38\u6E29\u533A\u771F\u679C\u7C92\u7F3A 1 \u5217",
          location: "\u5E38\u6E29\u8D27\u67B6 \xB7 \u771F\u679C\u7C92 250ml",
          impact: "\u5F71\u54CD\uFF1A\u65E5\u5747\u7EA6 2 \u74F6\u9500\u91CF\u6D41\u5931",
          actions: ["\u8865\u8D27 12 \u74F6"],
          relatedAnnotationIds: []
        }
      ],
      risk: {
        weeklyBottles: 58,
        weeklyAmount: 232,
        monthlyBottles: 249,
        monthlyAmount: 996,
        items: [
          {
            skuId: "SKU_001",
            skuName: "\u4F18\u76CAC 100ml",
            dailyAvgSales: 9,
            stdFacings: 3,
            actualFacings: 1,
            gapRatio: 0.667,
            elasticity: 0.35,
            dailyLossBottles: 8.3,
            unitPrice: 4
          }
        ],
        derivation: "\u2460 \u6392\u9762\u7F3A\u53E3\uFF1AC \u7C7B\u5E97\u51B7\u67DC\u6807\u51C6 3 \u5217\uFF0C\u5B9E\u9645\u6709\u6548 1 \u5217 \u2192 \u7F3A\u53E3\u5360\u6BD4 (3 \u2212 1) \xF7 3 = 66.7%\n\u2461 \u52A8\u9500\u57FA\u51C6\uFF1A\u4F18\u76CAC 100ml \u8FD1 4 \u5468\u65E5\u5747\u52A8\u9500 9 \u74F6/\u5929\n\u2462 \u5F39\u6027\u5047\u8BBE\uFF1A\u6392\u9762\u5F39\u6027\u7CFB\u6570 0.35\n\u2463 \u65E5\u5747\u6F5C\u5728\u635F\u5931 \u2248 8.3 \u74F6/\u5929\n\u2464 \u672C\u5468\u9884\u8BA1\u6D41\u5931 \u2248 58 \u74F6\uFF1B\u6309\u96F6\u552E\u6307\u5BFC\u4EF7 \xA54.0/\u74F6 \u2192 \u7EA6 \xA5232\n\u2465 \u6708\u5EA6\u9884\u8BA1\u6D41\u5931 = 58 \xD7 4.3 \u2248 249 \u74F6 \u2192 \u7EA6 \xA5996\n\u6574\u6539\u7ED3\u679C\uFF1A\u672C\u5468\u5B8C\u6210\u8865\u8D27 + \u62FF\u56DE\u9EC4\u91D1\u5217\u4F4D\u540E\uFF0C\u5B9E\u9645\u5206\u6570\u7531 48 \u56DE\u5347\u81F3 80\uFF08+32\uFF09\u3002"
      },
      plan: {
        storeTypeLabel: "\u8BE5\u5E97\u7C7B\u578B\u4E3A C\u7C7B\u4FBF\u5229",
        restock: [
          { skuId: "SKU_001", skuName: "\u4F18\u76CAC 100ml", bottles: 18, amount: 72 },
          { skuId: "SKU_006", skuName: "\u771F\u679C\u7C92 250ml", bottles: 12, amount: 48 },
          { skuId: "SKU_002", skuName: "\u4F18\u76CAC \u539F\u5473 450g", bottles: 9, amount: 36 }
        ],
        placement: [
          { text: "\u51B7\u67DC\u7B2C 2 \u5C42\u6062\u590D 3 \u5217\u8499\u725B\u6EE1\u6392" },
          { text: "\u771F\u679C\u7C92\u8865\u81F3\u5E38\u6E29\u7B2C 1 \u5C42\u7AEF\u5934" }
        ],
        totalBottles: 39,
        totalAmount: 156,
        coverDays: 3
      }
    },
    {
      key: "S4",
      storeId: "S4",
      storeName: "\u534E\u8054\u8D85\u5E02\xB7\u4E07\u8FBE\u5E97",
      visitId: "V_S4_001",
      createdAt: "2026-09-25 14:05",
      visitNo: 4,
      photoUrl: "/stores/S4/cold.jpg",
      shootTypes: ["cold"],
      dimensions: [68, 52, 75, 70, 45, 80],
      scoreOverride: null,
      prevScore: 62,
      expectedScore: 82,
      summary: {
        total: 5,
        skuCount: 3,
        emptyCount: 1,
        competitorCount: 1,
        priceTagCount: 1,
        stackCount: 1,
        text: "\u2726 AI \u8BC6\u522B\u6458\u8981\uFF1A\u8499\u725BSKU 3 \u9879 / \u7A7A\u4F4D 1 / \u7ADE\u54C1\u5360\u4F4D 1 / \u4EF7\u7B7E\u95EE\u9898 1 / \u5806\u5934\u672A\u6267\u884C 1"
      },
      annotations: [
        { id: "E01", layer: "mengniu", x: 3, y: 9, w: 47, h: 12, label: "\u7279\u4ED1\u82CF \u2714\u6392\u9762\u8FBE\u6807", skuId: "SKU_009" },
        { id: "E02", layer: "oos", x: 3, y: 27, w: 30, h: 13, label: "\u7EAF\u7504 \u25B3\u88AB\u6324\u81F3\u4E0B\u5C42", skuId: "SKU_005" },
        { id: "E03", layer: "empty", x: 33, y: 27, w: 22, h: 13, label: "\u7A7A\u4F4D \u2716\u7F3A\u8D27", skuId: "SKU_003" },
        { id: "E04", layer: "competitor", x: 60, y: 27, w: 30, h: 13, label: "\u5473\u5168 \u26A0\u7ADE\u54C1\u5360\u4F4D", skuId: "SKU_101" },
        { id: "E05", layer: "stack", x: 45, y: 62, w: 45, h: 25, label: "\u26A0 \u672C\u6708\u5806\u5934\u7269\u6599\u672A\u6267\u884C", skuId: "SKU_003" }
      ],
      issues: [
        {
          id: "IS1",
          severity: "severe",
          title: "\u51B7\u67DC\u7B2C 2 \u5C42\u51FA\u73B0\u6574\u5217\u7A7A\u4F4D",
          location: "\u51B7\u85CF\u67DC \xB7 \u5E94\u9648\u5217 \u51A0\u76CA\u4E73 250g",
          impact: "\u5F71\u54CD\uFF1A\u65E5\u5747\u7EA6 5.9 \u74F6\u9500\u91CF\u6D41\u5931",
          actions: ["\u8865\u8D27 12 \u74F6"],
          relatedAnnotationIds: ["E03"]
        },
        {
          id: "IS2",
          severity: "medium",
          title: "\u5806\u5934\u7269\u6599\u7F3A\u5931 3 \u9879",
          location: "\u95E8\u5E97\u5165\u53E3\u533A \xB7 \u672C\u6708\u5927\u5356\u573A\u8054\u5408\u5806\u5934",
          impact: "\u5F71\u54CD\uFF1A\u6D3B\u52A8\u671F\u7EA6\u635F\u5931 \xA5320 \u589E\u91CF\u9500\u552E",
          actions: ["\u7533\u8BF7\u7269\u6599"],
          relatedAnnotationIds: ["E05"]
        },
        {
          id: "IS3",
          severity: "medium",
          title: "\u7EAF\u7504\u88AB\u6324\u81F3\u7B2C 3 \u5C42",
          location: "\u51B7\u85CF\u67DC \xB7 \u7EAF\u7504\u5E38\u6E29\u9178\u5976\u9648\u5217\u5C42\u7EA7\u4E0D\u8FBE\u6807",
          impact: "\u5F71\u54CD\uFF1A\u89C6\u7EBF\u5C42\u52A8\u9500\u635F\u5931\u7EA6 1.8 \u500D",
          actions: ["\u8C03\u6574\u9648\u5217"],
          relatedAnnotationIds: ["E02"]
        }
      ],
      risk: {
        weeklyBottles: 41,
        weeklyAmount: 185,
        monthlyBottles: 176,
        monthlyAmount: 792,
        items: [
          {
            skuId: "SKU_003",
            skuName: "\u51A0\u76CA\u4E73 250g",
            dailyAvgSales: 10,
            stdFacings: 4,
            actualFacings: 2.5,
            gapRatio: 0.375,
            elasticity: 0.35,
            dailyLossBottles: 5.9,
            unitPrice: 4.5
          }
        ],
        derivation: "\u2460 \u6392\u9762\u7F3A\u53E3\uFF1AB \u7C7B\u5927\u5356\u573A\u51B7\u67DC\u6807\u51C6 4 \u5217\uFF0C\u5B9E\u9645\u6709\u6548 2.5 \u5217 \u2192 \u7F3A\u53E3\u5360\u6BD4 (4 \u2212 2.5) \xF7 4 = 37.5%\n\u2461 \u52A8\u9500\u57FA\u51C6\uFF1A\u51A0\u76CA\u4E73 250g \u8FD1 4 \u5468\u65E5\u5747\u52A8\u9500 10 \u74F6/\u5929\n\u2462 \u5F39\u6027\u5047\u8BBE\uFF1A\u6392\u9762\u5F39\u6027\u7CFB\u6570 0.35\n\u2463 \u65E5\u5747\u6F5C\u5728\u635F\u5931 \u2248 5.9 \u74F6/\u5929\n\u2464 \u672C\u5468\u9884\u8BA1\u6D41\u5931 \u2248 41 \u74F6\uFF1B\u6309\u96F6\u552E\u6307\u5BFC\u4EF7 \xA54.5/\u74F6 \u2192 \u7EA6 \xA5185\n\u2465 \u6708\u5EA6\u9884\u8BA1\u6D41\u5931 = 41 \xD7 4.3 \u2248 176 \u74F6 \u2192 \u7EA6 \xA5792"
      },
      plan: {
        storeTypeLabel: "\u8BE5\u5E97\u7C7B\u578B\u4E3A B\u7C7B\u5927\u5356\u573A",
        restock: [
          { skuId: "SKU_003", skuName: "\u51A0\u76CA\u4E73 250g", bottles: 12, amount: 66 },
          { skuId: "SKU_005", skuName: "\u7EAF\u7504\u5E38\u6E29\u9178\u5976", bottles: 10, amount: 45 },
          { skuId: "SKU_006", skuName: "\u771F\u679C\u7C92 250ml", bottles: 8, amount: 32 }
        ],
        placement: [
          { text: "\u7EAF\u7504\u56DE\u8C03\u81F3\u51B7\u67DC\u7B2C 2 \u5C42\u89C6\u7EBF\u5C42" },
          { text: "\u5165\u53E3\u5806\u5934\u6267\u884C\u300C\u51A0\u76CA\u4E73 \xD7 \u771F\u679C\u7C92\u300D\u53CC\u54C1\u9648\u5217" }
        ],
        totalBottles: 30,
        totalAmount: 143,
        coverDays: 3
      }
    },
    {
      key: "S5",
      storeId: "S5",
      storeName: "\u6C38\u8F89\u751F\u6D3B\xB7\u4E2D\u592E\u516C\u56ED\u5E97",
      visitId: "V_S5_001",
      createdAt: "2026-09-25 16:30",
      visitNo: 7,
      photoUrl: "/stores/S5/cold.jpg",
      shootTypes: ["cold"],
      dimensions: [48, 30, 55, 38, 40, 60],
      scoreOverride: null,
      prevScore: 46,
      expectedScore: 72,
      summary: {
        total: 6,
        skuCount: 3,
        emptyCount: 2,
        competitorCount: 2,
        priceTagCount: 2,
        stackCount: 1,
        text: "\u2726 AI \u8BC6\u522B\u6458\u8981\uFF1A\u8499\u725BSKU 3 \u9879 / \u7A7A\u4F4D 2 / \u7ADE\u54C1\u5360\u4F4D 2 / \u4EF7\u7B7E\u95EE\u9898 2 / \u5806\u5934\u672A\u6267\u884C 1"
      },
      annotations: [
        { id: "F01", layer: "empty", x: 3, y: 27, w: 28, h: 13, label: "\u7A7A\u4F4D \u2716\u7F3A\u8D27", skuId: "SKU_001" },
        { id: "F02", layer: "empty", x: 31, y: 27, w: 25, h: 13, label: "\u7A7A\u4F4D \u2716\u7F3A\u8D27", skuId: "SKU_002" },
        { id: "F03", layer: "competitor", x: 56, y: 27, w: 18, h: 13, label: "\u5473\u5168 \u26A0\u7ADE\u54C1\u5360\u4F4D", skuId: "SKU_101" },
        { id: "F04", layer: "competitor", x: 74, y: 27, w: 18, h: 13, label: "\u6BCF\u76CA\u6DFB \u26A0\u7ADE\u54C1\u5360\u4F4D", skuId: "SKU_103" },
        { id: "F05", layer: "pricetag", x: 3, y: 37.5, w: 18, h: 5, label: "\u2716 \u4EF7\u7B7E\u7F3A\u5931", skuId: "SKU_001" },
        { id: "F06", layer: "stack", x: 45, y: 62, w: 45, h: 25, label: "\u26A0 \u672C\u6708\u5806\u5934\u7269\u6599\u672A\u6267\u884C", skuId: "SKU_003" }
      ],
      issues: [
        {
          id: "IS1",
          severity: "severe",
          title: "\u7F3A\u8D27 5 \u9879 \xB7 \u51B7\u67DC 2 \u5217\u8FDE\u7EED\u7A7A\u4F4D",
          location: "\u51B7\u85CF\u67DC\u7B2C 2 \u5C42 \xB7 \u4F18\u76CAC 100ml / \u4F18\u76CAC 450g",
          impact: "\u5F71\u54CD\uFF1A\u65E5\u5747\u7EA6 11.1 \u74F6\u9500\u91CF\u6D41\u5931",
          actions: ["\u7D27\u6025\u8865\u8D27 24 \u74F6"],
          relatedAnnotationIds: ["F01", "F02"]
        },
        {
          id: "IS2",
          severity: "severe",
          title: "\u7ADE\u54C1\u5360\u636E 2 \u4E2A\u9EC4\u91D1\u5217\u4F4D",
          location: "\u51B7\u85CF\u67DC\u7B2C 2 \u5C42 \xB7 \u6392\u9762\u88AB\u5473\u5168 / \u6BCF\u76CA\u6DFB\u74DC\u5206",
          impact: "\u5F71\u54CD\uFF1A\u8499\u725B\u6392\u9762\u5360\u6BD4\u8DCC\u81F3 38%",
          actions: ["\u67E5\u770B\u7ADE\u4E89\u8BDD\u672F"],
          relatedAnnotationIds: ["F03", "F04"]
        },
        {
          id: "IS3",
          severity: "medium",
          title: "\u4EF7\u7B7E\u7F3A\u5931 2 \u5904",
          location: "\u51B7\u85CF\u67DC \xB7 \u4F18\u76CAC \u7CFB\u5217",
          impact: "\u5F71\u54CD\uFF1A\u987E\u5BA2\u65E0\u6CD5\u6BD4\u4EF7",
          actions: ["\u6253\u5370\u4EF7\u7B7E"],
          relatedAnnotationIds: ["F05"]
        },
        {
          id: "IS4",
          severity: "medium",
          title: "\u672C\u6708\u5806\u5934\u672A\u6267\u884C",
          location: "\u95E8\u5E97\u5165\u53E3\u533A \xB7 \u793E\u533A\u751F\u9C9C\u8054\u5408\u5806\u5934",
          impact: "\u5F71\u54CD\uFF1A\u6D3B\u52A8\u671F\u7EA6\u635F\u5931 \xA5400 \u589E\u91CF\u9500\u552E",
          actions: ["\u7533\u8BF7\u7269\u6599"],
          relatedAnnotationIds: ["F06"]
        },
        {
          id: "IS5",
          severity: "low",
          title: "\u8FDE\u7EED 3 \u5468\u5065\u5EB7\u5206\u4E0B\u6ED1",
          location: "\u8FD1 3 \u5468\uFF1A-3.2 / -2.1 / -1.8",
          impact: "\u5F71\u54CD\uFF1A\u5DF2\u8FDB\u5165\u533A\u57DF\u7EA2\u706F\u6E05\u5355",
          actions: ["\u4ECA\u5929\u5C31\u5DE1"],
          relatedAnnotationIds: []
        }
      ],
      risk: {
        weeklyBottles: 78,
        weeklyAmount: 312,
        monthlyBottles: 335,
        monthlyAmount: 1340,
        items: [
          {
            skuId: "SKU_001",
            skuName: "\u4F18\u76CAC 100ml",
            dailyAvgSales: 12,
            stdFacings: 4,
            actualFacings: 1.5,
            gapRatio: 0.625,
            elasticity: 0.35,
            dailyLossBottles: 11.1,
            unitPrice: 4
          }
        ],
        derivation: "\u2460 \u6392\u9762\u7F3A\u53E3\uFF1AB \u7C7B\u793E\u533A\u751F\u9C9C\u51B7\u67DC\u6807\u51C6 4 \u5217\uFF0C\u5B9E\u9645\u6709\u6548 1.5 \u5217 \u2192 \u7F3A\u53E3\u5360\u6BD4 (4 \u2212 1.5) \xF7 4 = 62.5%\n\u2461 \u52A8\u9500\u57FA\u51C6\uFF1A\u4F18\u76CAC 100ml \u8FD1 4 \u5468\u65E5\u5747\u52A8\u9500 12 \u74F6/\u5929\n\u2462 \u5F39\u6027\u5047\u8BBE\uFF1A\u6392\u9762\u5F39\u6027\u7CFB\u6570 0.35\n\u2463 \u65E5\u5747\u6F5C\u5728\u635F\u5931 \u2248 11.1 \u74F6/\u5929\n\u2464 \u672C\u5468\u9884\u8BA1\u6D41\u5931 \u2248 78 \u74F6\uFF1B\u6309\u96F6\u552E\u6307\u5BFC\u4EF7 \xA54.0/\u74F6 \u2192 \u7EA6 \xA5312\n\u2465 \u6708\u5EA6\u9884\u8BA1\u6D41\u5931 = 78 \xD7 4.3 \u2248 335 \u74F6 \u2192 \u7EA6 \xA51340\n\u26A0 \u8BE5\u5E97\u5DF2\u8FDE\u7EED 3 \u5468\u4E0B\u6ED1\uFF08-3.2 / -2.1 / -1.8\uFF09\uFF0C\u4E14\u4F18\u76CAC \u65AD\u8D27 3 \u5929\u4EE5\u4E0A\uFF0C\u5EFA\u8BAE 24 \u5C0F\u65F6\u5185\u6574\u6539\u3002"
      },
      plan: {
        storeTypeLabel: "\u8BE5\u5E97\u7C7B\u578B\u4E3A B\u7C7B\u793E\u533A\u751F\u9C9C",
        restock: [
          { skuId: "SKU_001", skuName: "\u4F18\u76CAC 100ml", bottles: 24, amount: 96 },
          { skuId: "SKU_002", skuName: "\u4F18\u76CAC \u539F\u5473 450g", bottles: 12, amount: 48 },
          { skuId: "SKU_003", skuName: "\u51A0\u76CA\u4E73 250g", bottles: 12, amount: 66 }
        ],
        placement: [
          { text: "\u4F18\u76CAC \u7CFB\u5217\u96C6\u4E2D\u4E0A\u79FB\u81F3\u51B7\u67DC\u7B2C 2 \u5C42\uFF0C\u5F62\u6210 3 \u5217\u8FDE\u6392" },
          { text: "\u5165\u53E3\u7AEF\u67B6\u6267\u884C\u300C\u4F18\u76CAC \xD7 \u51A0\u76CA\u4E73\u300D\u793E\u533A\u7279\u60E0\u5806\u5934" }
        ],
        totalBottles: 48,
        totalAmount: 210,
        coverDays: 4
      }
    }
  ]
};

// src/fixtures/dashboard.json
var dashboard_default = {
  schemaVersion: "1.0",
  items: {
    regionId: "R_EAST",
    regionIds: [
      { id: "R_EAST", name: "\u57CE\u4E1C\u7247\u533A" },
      { id: "R_SOUTH", name: "\u57CE\u5357\u7247\u533A" },
      { id: "R_NORTH", name: "\u57CE\u5317\u7247\u533A" }
    ],
    kpis: [
      {
        key: "avgScore",
        label: "\u533A\u57DF\u5E73\u5747\u5065\u5EB7\u5206",
        value: "74.3",
        delta: "\u21913.8",
        trend: "up",
        target: "\u76EE\u6807 80",
        danger: false
      },
      {
        key: "redStores",
        label: "\u7EA2\u706F\u95E8\u5E97",
        value: "12",
        delta: "\u21935",
        trend: "down",
        target: "\u9700 24h \u5904\u7406",
        danger: true
      },
      {
        key: "oosRate",
        label: "\u672C\u5468\u7F3A\u8D27\u7387",
        value: "7.2%",
        delta: "\u21932.6pt",
        trend: "down",
        target: null,
        danger: false
      },
      {
        key: "coverage",
        label: "\u8499\u725B\u94FA\u8D27\u7387",
        value: "86.4%",
        delta: "\u21913.1pt",
        trend: "up",
        target: null,
        danger: false
      }
    ],
    distribution: [
      { level: "excellent", label: "\u4F18\u79C0", count: 42, ratio: 0.328, color: "#009639" },
      { level: "good", label: "\u826F\u597D", count: 53, ratio: 0.414, color: "#8BC34A" },
      { level: "warning", label: "\u9884\u8B66", count: 21, ratio: 0.164, color: "#FF9800" },
      { level: "risk", label: "\u98CE\u9669", count: 12, ratio: 0.094, color: "#E02020" }
    ],
    trend: [
      {
        key: "score",
        name: "\u5E73\u5747\u5065\u5EB7\u5206",
        points: [62.1, 64.5, 66.8, 68.2, 70.4, 71.9, 73.5, 74.3],
        weeks: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
        unit: "\u5206"
      },
      {
        key: "oosRate",
        name: "\u7F3A\u8D27\u7387",
        points: [18.4, 16.9, 15.2, 13.8, 11.5, 9.8, 8.3, 7.2],
        weeks: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
        unit: "%"
      },
      {
        key: "coverage",
        name: "\u94FA\u8D27\u7387",
        points: [71.2, 73.5, 75.8, 78.1, 80.4, 82.6, 84.5, 86.4],
        weeks: ["W1", "W2", "W3", "W4", "W5", "W6", "W7", "W8"],
        unit: "%"
      }
    ],
    riskTop5: [
      {
        storeId: "S5",
        storeName: "\u6C38\u8F89\u751F\u6D3B\xB7\u4E2D\u592E\u516C\u56ED\u5E97",
        score: 43,
        level: "risk",
        reason: "\u8FDE\u7EED 3 \u5468\u4E0B\u6ED1 \xB7 \u7F3A\u8D27 5 \u9879"
      },
      {
        storeId: "S4",
        storeName: "\u534E\u8054\u8D85\u5E02\xB7\u4E07\u8FBE\u5E97",
        score: 64,
        level: "warning",
        reason: "\u6392\u9762\u88AB\u6324\u538B \xB7 \u5806\u5934\u7269\u6599\u7F3A\u5931 3 \u9879"
      },
      {
        storeId: "S3",
        storeName: "\u7F8E\u5B9C\u4F73\xB7\u57CE\u5EFA\u5B66\u9662\u5E97",
        score: 72,
        level: "good",
        reason: "\u9EC4\u91D1\u5217\u4F4D\u88AB\u7ADE\u54C1\u5360\u7528 \xB7 \u7F3A\u8D27 1 \u5217"
      },
      {
        storeId: "S2",
        storeName: "\u597D\u90BB\u5C45\xB7\u5730\u94C1\u53E3\u5E97",
        score: 80,
        level: "good",
        reason: "\u4EF7\u7B7E\u7F3A\u5931 1 \u5904 \xB7 \u5DF2\u5B8C\u6210\u6574\u6539\u95ED\u73AF"
      },
      {
        storeId: "S1",
        storeName: "\u5BB6\u5BB6\u60A6\xB7\u5B66\u5E9C\u8DEF\u5E97",
        score: 91,
        level: "excellent",
        reason: "\u4EC5 1 \u5904\u4EF7\u7B7E\u8F7B\u5EA6\u7F3A\u5931 \xB7 \u533A\u57DF\u6807\u6746\u5E97"
      }
    ],
    storeRows: [
      {
        storeId: "S5",
        storeName: "\u6C38\u8F89\u751F\u6D3B\xB7\u4E2D\u592E\u516C\u56ED\u5E97",
        score: 43,
        level: "risk",
        mainIssue: "\u7F3A\u8D27 5 \u9879",
        weekDelta: -3,
        visitId: "V_S5_001"
      },
      {
        storeId: "S4",
        storeName: "\u534E\u8054\u8D85\u5E02\xB7\u4E07\u8FBE\u5E97",
        score: 64,
        level: "warning",
        mainIssue: "\u6392\u9762\u88AB\u6324\u538B",
        weekDelta: 2,
        visitId: "V_S4_001"
      },
      {
        storeId: "S3",
        storeName: "\u7F8E\u5B9C\u4F73\xB7\u57CE\u5EFA\u5B66\u9662\u5E97",
        score: 72,
        level: "good",
        mainIssue: "\u9EC4\u91D1\u5217\u4F4D\u88AB\u5360",
        weekDelta: 0,
        visitId: "V_S3_001"
      },
      {
        storeId: "S2",
        storeName: "\u597D\u90BB\u5C45\xB7\u5730\u94C1\u53E3\u5E97",
        score: 80,
        level: "good",
        mainIssue: "\u4EF7\u7B7E\u7F3A\u5931 1 \u5904",
        weekDelta: 32,
        visitId: "V_S2_002"
      },
      {
        storeId: "S1",
        storeName: "\u5BB6\u5BB6\u60A6\xB7\u5B66\u5E9C\u8DEF\u5E97",
        score: 91,
        level: "excellent",
        mainIssue: "\u65E0\u91CD\u5927\u95EE\u9898",
        weekDelta: 4,
        visitId: "V_S1_001"
      }
    ]
  }
};

// src/fixtures/chat-qa.json
var chat_qa_default = {
  schemaVersion: "1.0",
  suggestions: [
    "\u4E3A\u4EC0\u4E48\u8FD9\u4E2A\u4F4D\u7F6E\u4E0D\u597D\uFF1F",
    "\u8BE5\u8865\u591A\u5C11\uFF1F",
    "\u8DDF\u5E97\u4E3B\u600E\u4E48\u8BF4\uFF1F",
    "\u7ADE\u54C1\u5360\u7740\u4F4D\u7F6E\u4E0D\u8BA9\u600E\u4E48\u529E\uFF1F",
    "\u8FD9\u5BB6\u5E97\u6211\u6700\u8BE5\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
    "\u5E2E\u6211\u5B9A\u4E00\u4E0B\u8FD9\u6B21\u7684\u6574\u6539\u52A8\u4F5C"
  ],
  fallback: {
    miss: "\u8FD9\u5757\u6211\u4F1A\u7ED3\u5408\u4F60\u5E97\u91CC\u8FD1 4 \u5468\u7684\u52A8\u9500\u6570\u636E\u4E00\u8D77\u770B\uFF0C\u5EFA\u8BAE\u4F60\u73B0\u573A\u5148\u8DDF\u533A\u57DF\u7ECF\u7406\u738B\u654F\u786E\u8BA4\u4E00\u4E0B\uFF0C\u6211\u628A\u8FD9\u4E2A\u95EE\u9898\u8BB0\u8FDB\u672C\u6B21\u5DE1\u5E97\u5907\u6CE8\u3002",
    empty: "\u53EF\u4EE5\u8BD5\u8BD5\u95EE\u6211\uFF1A\u8BE5\u8865\u591A\u5C11 / \u8DDF\u5E97\u4E3B\u600E\u4E48\u8BF4 / \u7ADE\u54C1\u5360\u4F4D\u600E\u4E48\u529E\u3002",
    recommend: ["\u8BE5\u8865\u591A\u5C11\uFF1F", "\u8DDF\u5E97\u4E3B\u600E\u4E48\u8BF4\uFF1F", "\u7ADE\u54C1\u5360\u7740\u4F4D\u7F6E\u4E0D\u8BA9\u600E\u4E48\u529E\uFF1F"]
  },
  items: [
    {
      id: "Q1",
      question: "\u4E3A\u4EC0\u4E48\u8FD9\u4E2A\u4F4D\u7F6E\u4E0D\u597D\uFF1F",
      keywords: ["\u4E3A\u4EC0\u4E48", "\u4F4D\u7F6E", "\u4E0D\u597D", "\u9EC4\u91D1", "\u5C42\u7EA7", "\u89C6\u7EBF", "\u54EA\u91CC", "\u6446\u54EA"],
      reply: "\u8FD9\u5BB6\u5E97\u662F C \u7C7B\u6821\u56ED\u4FBF\u5229\u5E97\uFF0C\u51B7\u67DC\u7B2C 2 \u5C42\u662F\u9EC4\u91D1\u89C6\u7EBF\u5C42\uFF08\u79BB\u5730 1.2\u20131.6m\uFF09\uFF0C\u987E\u5BA2\u8FDB\u5E97\u7B2C\u4E00\u773C\u5C31\u843D\u5728\u8FD9\u5C42\u3002\u73B0\u5728\u4F18\u76CAC \u53EA\u5360\u4E86\u7B2C 2 \u5C42\u7684\u52171\uFF0C\u52173 \u8FD8\u7A7A\u7740\u3001\u52174 \u88AB\u5473\u5168\u538B\u7740\uFF0C\u7B49\u4E8E\u628A\u6700\u597D\u7684\u4F4D\u7F6E\u8BA9\u51FA\u4E86 2 \u5217\u3002\n\u540C\u7C7B C \u7C7B\u5E97\u7684\u5BF9\u6BD4\u6570\u636E\uFF1A\u9EC4\u91D1\u5C42\u5355\u5217\u65E5\u5747\u52A8\u9500 11 \u74F6\uFF0C\u5E95\u5C42\u53EA\u6709 5.2 \u74F6\uFF0C\u5DEE 2.1 \u500D\u3002\u6240\u4EE5\u4E0D\u662F\u201C\u6446\u5F97\u4E11\u201D\u7684\u95EE\u9898\uFF0C\u662F\u5B9E\u6253\u5B9E\u5C11\u5356\u94B1\u3002",
      highlightSection: null
    },
    {
      id: "Q2",
      question: "\u8BE5\u8865\u591A\u5C11\uFF1F",
      keywords: ["\u8865\u591A\u5C11", "\u8865\u8D27", "\u8BA2\u591A\u5C11", "\u6570\u91CF", "\u51E0\u74F6", "\u591A\u5C11\u74F6", "\u5EFA\u8BAE\u8BA2", "\u8BA2\u91CF"],
      reply: "\u6309\u8FD9\u5BB6\u5E97\u8FD1 4 \u5468\u6570\u636E\u7B97\uFF1A\u4F18\u76CAC \u65E5\u5747\u52A8\u9500 11 \u74F6/\u5929\uFF0C\u4F60\u4E0B\u6B21\u6765\u662F 3 \u5929\u540E\u3002\n\xB7 \u4F18\u76CAC 100ml\uFF1A\u6807\u51C6\u6392\u9762 4 \u5217\uFF08\u51B7\u67DC L2\uFF09\uFF0C\u73B0\u5728\u53EA\u6709 1 \u5217\u6EE1\u6392 \u2192 \u9700\u8865 12 \u74F6\uFF08\xA548\uFF09\n\xB7 \u4F18\u76CAC 450g\uFF1A\u53EA\u5269 3 \u74F6 \u2192 \u8865\u5230\u6EE1\u6392\u9700 9 \u74F6\uFF08\xA536\uFF09\n\xB7 \u771F\u679C\u7C92 250ml\uFF1A\u7F3A 1 \u5217 \u2192 \u8865 6 \u74F6\uFF08\xA524\uFF09\n\u5408\u8BA1 36 \u74F6 / \xA5144\uFF0C\u521A\u597D\u8986\u76D6 3 \u5929\u52A8\u9500 + \u5C11\u91CF\u5B89\u5168\u5E93\u5B58\u3002\u522B\u4E00\u6B21\u8BA2\u592A\u591A\uFF0CC \u7C7B\u5E97\u51B7\u67DC\u5468\u8F6C\u5FEB\uFF0C\u5C0F\u6279\u91CF\u52E4\u8865\u66F4\u5B89\u5168\u3002",
      highlightSection: "plan"
    },
    {
      id: "Q3",
      question: "\u8DDF\u5E97\u4E3B\u600E\u4E48\u8BF4\uFF1F",
      keywords: ["\u5E97\u4E3B", "\u600E\u4E48\u8BF4", "\u8BDD\u672F", "\u6C9F\u901A", "\u8C08\u5224", "\u8001\u677F", "\u9648\u54E5", "\u6C9F\u901A\u8BDD\u672F"],
      reply: "\u5EFA\u8BAE\u8FD9\u4E48\u8BF4\uFF08\u7167\u7740\u5FF5\u5C31\u884C\uFF09\uFF1A\n\u201C\u9648\u54E5\uFF0C\u6211\u770B\u4E86\u4E0B\u4F60\u8FD9\u51B7\u67DC\uFF0C\u4F18\u76CAC \u8FD9\u5468\u8D70\u5F97\u633A\u5FEB\uFF0C\u6628\u5929\u9AD8\u5CF0\u671F\u65AD\u8FC7\u4E00\u6B21\u2014\u2014\u4F60\u7B2C\u4E8C\u5C42\u53F3\u8FB9\u90A3\u683C\u73B0\u5728\u662F\u7A7A\u7684\u3002\u6821\u56ED\u5E97\u4E2D\u5348\u548C\u665A\u4E0A\u4E24\u4E2A\u9AD8\u5CF0\uFF0C\u5B66\u751F\u76F4\u63A5\u62FF\u7B2C\u4E8C\u5C42\uFF0C\u7F8A\u5976\u5473\u7684\u4F18\u76CAC \u6211\u7ED9\u4F60\u8865 12 \u74F6\u4E0A\u53BB\uFF0C\u987A\u5E26\u628A\u4EF7\u7B7E\u91CD\u65B0\u8D34\u4E00\u5F20\u3002\u4E0A\u5468\u632A\u5230\u7B2C\u4E8C\u5C42\u90A3\u5BB6\u540C\u7C7B\u578B\u7684\u5E97\uFF0C\u8FD9\u4E00\u5468\u591A\u5356\u4E86 30 \u591A\u74F6\uFF0C\u4F60\u8BD5\u8BD5\uFF0C\u5356\u4E0D\u52A8\u4E0B\u5468\u6211\u7ED9\u4F60\u9000\u3002\u201D\n\u8981\u70B9\uFF1A\u5148\u7ED9\u6570\u636E\uFF08\u8D70\u5F97\u5FEB/\u4F1A\u65AD\u8D27\uFF09\uFF0C\u518D\u7ED9\u52A8\u4F5C\uFF0C\u6700\u540E\u7ED9\u627F\u8BFA\uFF08\u5356\u4E0D\u52A8\u5305\u9000\uFF09\u3002",
      highlightSection: null
    },
    {
      id: "Q4",
      question: "\u7ADE\u54C1\u5360\u7740\u4F4D\u7F6E\u4E0D\u8BA9\u600E\u4E48\u529E\uFF1F",
      keywords: ["\u7ADE\u54C1", "\u5473\u5168", "\u5360\u4F4D", "\u4E0D\u8BA9", "\u7ADE\u4E89", "\u62A2\u4F4D", "\u517B\u4E50\u591A", "\u8C08\u5224"],
      reply: "\u522B\u4E89\u201C\u8C01\u7684\u4F4D\u5B50\u201D\uFF0C\u8BB2\u201C\u8C01\u7684\u5229\u6DA6\u201D\uFF1A\n1. \u5473\u5168 332ml \u5355\u74F6\u6BDB\u5229\u7EA6 \xA50.8\uFF0C\u4F18\u76CAC 100ml \u5355\u74F6\u6BDB\u5229 \xA51.2\uFF0C\u9AD8\u51FA 50%\uFF1B\u540C\u6837\u4E00\u683C\u6446\u4E00\u5468\uFF0C\u8499\u725B\u591A\u8D5A\u7EA6 \xA525\u3002\n2. \u7ED9\u5B66\u751F\u5E97\u4E00\u53E5\u5B9E\u5728\u8BDD\uFF1A\u201C\u5B66\u751F\u8BA4\u724C\u5B50\uFF0C\u4F18\u76CAC \u5728\u4F60\u8FD9\u79CD\u5B66\u6821\u95E8\u53E3\u5E97\u662F\u81EA\u5E26\u6D41\u91CF\u7684\u3002\u201D\n3. \u9000\u4E00\u6B65\u7684\u505A\u6CD5\uFF1A\u4E89\u53D6\u628A\u7B2C 2 \u5C42\u52174 \u6362\u6210\u4E09\u4E03\u5F00\uFF08\u8499\u725B 3 \u5217\u3001\u5473\u5168\u4FDD\u7559 1 \u5217\uFF09\uFF0C\u5148\u62FF\u5230\u4E00\u534A\u9EC4\u91D1\u4F4D\uFF0C\u4E0B\u6B21\u7528\u52A8\u9500\u6570\u636E\u518D\u8C08\u5269\u4E0B\u7684\u3002\n4. \u5B9E\u5728\u8C08\u4E0D\u4E0B\u6765\uFF1A\u9000\u800C\u6C42\u5176\u6B21\u4E89\u53D6\u7B2C 2 \u5C42\u7684\u7AEF\u5934\u4F4D\u6216\u6536\u94F6\u53F0\u65C1\u7684\u5E38\u6E29\u5C0F\u5806\u5934\uFF0C\u4E5F\u6BD4\u7559\u5728\u5E95\u5C42\u5F3A\u3002",
      highlightSection: null
    },
    {
      id: "Q5",
      question: "\u8FD9\u5BB6\u5E97\u6211\u6700\u8BE5\u5148\u505A\u54EA\u4E00\u4EF6\uFF1F",
      keywords: ["\u5148\u505A", "\u4F18\u5148", "\u987A\u5E8F", "\u54EA\u4EF6", "\u7B2C\u4E00\u6B65", "\u5148\u5E72", "\u6700\u5148", "\u4F18\u5148\u7EA7"],
      reply: "\u6309\u6295\u5165\u4EA7\u51FA\u6392\uFF1A\u2460 \u8865\u4F18\u76CAC 100ml\uFF085 \u5206\u949F\uFF0C\u76F4\u63A5\u6B62\u635F\u65E5\u5747 3.9 \u74F6\uFF09\u2192 \u2461 \u60F3\u8BDD\u672F\u628A\u52174 \u62FF\u56DE\u6765\uFF08\u672C\u5468\u6D41\u5931\u5F71\u54CD\u6700\u5927\uFF09\u2192 \u2462 \u8865\u4EF7\u7B7E\uFF08\u987A\u624B\uFF0C1 \u5206\u949F\uFF09\u2192 \u2463 \u5806\u5934\uFF08\u9700\u8981\u7533\u8BF7\u7269\u6599\uFF0C\u4E0B\u5468\u505A\uFF09\u3002\n\u524D\u4E24\u6B65\u4ECA\u5929\u505A\u6389\u5C31\u884C\uFF0C\u5065\u5EB7\u5206\u80FD\u4ECE 72 \u62C9\u5230 85 \u5DE6\u53F3\u3002",
      highlightSection: null
    },
    {
      id: "Q6",
      question: "\u5E2E\u6211\u5B9A\u4E00\u4E0B\u8FD9\u6B21\u7684\u6574\u6539\u52A8\u4F5C",
      keywords: ["\u6574\u6539", "\u52A8\u4F5C", "\u65B9\u6848", "\u6574\u7406", "\u751F\u6210", "\u600E\u4E48\u529E", "\u5B9A\u4E00\u4E0B", "\u6392\u4E00\u4E0B"],
      reply: "\u597D\uFF0C\u5DF2\u6574\u7406\u2014\u2014\n\xB7 \u8865\u8D27\uFF1A\u4F18\u76CAC 100ml\xD712 \u74F6\u3001\u4F18\u76CAC 450g\xD79 \u74F6\u3001\u771F\u679C\u7C92\xD76 \u74F6\uFF0C\u5408\u8BA1 36 \u74F6 \xA5144\n\xB7 \u9648\u5217\uFF1A\u4F18\u76CAC \u4E0A\u79FB\u81F3\u51B7\u67DC L2 \u52173\uFF1B\u5E38\u6E29\u7EAF\u7504\u8C03\u56DE\u7B2C 1 \u5C42\uFF08\u4E0E\u89C6\u7EBF\u9F50\u5E73\uFF09\n\xB7 \u4EF7\u7B7E\uFF1A\u8865 2 \u5F20\u3001\u6539 1 \u5F20\uFF083.5 \u2192 4.0 \u5143\uFF09\n\xB7 \u5806\u5934\uFF1A\u7533\u8BF7\u201C\u51A0\u76CA\u4E73 \xD7 \u4F18\u76CAC\u201D\u53CC\u54C1\u5806\u5934\u7269\u6599\uFF0C\u7EA6\u5B9A\u4E0B\u5468\u4E8C\u6267\u884C\n\xB7 \u590D\u67E5\uFF1A\u672C\u5468\u4E94\u5DE1\u5E97\u65F6\u590D\u67E5\uFF0C\u9884\u8BA1\u5C4A\u65F6 89 \u5206\n\u8981\u6211\u628A\u8FD9\u4E9B\u751F\u6210\u6574\u6539\u5355\u53D1\u7ED9\u9648\u5E97\u957F\u5417\uFF1F",
      highlightSection: "plan"
    }
  ]
};

// src/fixtures/index.ts
var users = users_default.items;
var stores = stores_default.items;
var skus = skus_default.items;
var visits = visits_default.items;
var diagnoses = diagnoses_default.items;
var defaultSteps = diagnoses_default.defaultSteps;
var roleOptions = [
  { id: "rep", name: "\u4E1A\u4EE3 \xB7 \u674E\u5F3A", desc: "\u62CD\u8D27\u67B6 \xB7 AI\u8BCA\u65AD \xB7 \u62FF\u65B9\u6848", sub: "\u8F96\u533A 128 \u5BB6 | \u4ECA\u65E5\u5F85\u5DE1 5 \u5BB6", recommended: true },
  { id: "manager", name: "\u533A\u57DF\u7ECF\u7406 \xB7 \u738B\u654F", desc: "\u770B\u677F \xB7 \u6D3E\u4EFB\u52A1", sub: "\u57CE\u4E1C\u7247\u533A | 128 \u5BB6\u95E8\u5E97", recommended: false },
  { id: "owner", name: "\u5E97\u5458/\u5E97\u4E3B \xB7 \u5F20\u5927\u59D0", desc: "\u81EA\u52A9\u8BCA\u65AD \xB7 \u8BA2\u8D27", sub: "\u597D\u90BB\u5C45 \xB7 \u5730\u94C1\u53E3\u5E97", recommended: false }
];
var chatQa = {
  suggestions: chat_qa_default.suggestions,
  fallback: chat_qa_default.fallback,
  items: chat_qa_default.items
};
var dashboard = dashboard_default.items;
function validateFixtures() {
  const all = [
    checkFixture("users", users_default),
    checkFixture("stores", stores_default),
    checkFixture("skus", skus_default),
    checkFixture("visits", visits_default),
    checkFixture("diagnoses", diagnoses_default),
    checkFixture("dashboard", dashboard_default),
    checkFixture("chat-qa", chat_qa_default)
  ];
  return all.every(Boolean);
}

// src/utils/format.ts
function round1(value, digits = 1) {
  const p = Math.pow(10, digits);
  return Math.round(value * p) / p;
}
function uid(prefix = "ID") {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

// src/api/mock/db.ts
var DB_KEY = "store-app:db:v1";
function clone(v) {
  return JSON.parse(JSON.stringify(v));
}
var staticUsers = clone(users);
var staticStores = clone(stores);
var staticSkus = clone(skus);
var staticVisits = clone(visits);
var staticDiagnosesRaw = clone(diagnoses);
var db = {
  users: staticUsers,
  stores: staticStores,
  skus: staticSkus,
  visits: staticVisits,
  tasks: [],
  tickets: [],
  diagnoses: {},
  uploads: {}
};
function persist() {
  try {
    localStorage.setItem(
      DB_KEY,
      JSON.stringify({
        tasks: db.tasks,
        tickets: db.tickets,
        uploads: db.uploads,
        extraVisits: db.visits.filter((v) => v.id.startsWith("V_T"))
      })
    );
  } catch (e) {
    try {
      localStorage.setItem(DB_KEY, JSON.stringify({ tasks: db.tasks, tickets: db.tickets, uploads: {}, extraVisits: [] }));
    } catch {
    }
  }
}
function restore() {
  validateFixtures();
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (Array.isArray(saved.tasks)) db.tasks = saved.tasks;
    if (Array.isArray(saved.tickets)) db.tickets = saved.tickets;
    if (saved.uploads) db.uploads = saved.uploads;
    if (Array.isArray(saved.extraVisits) && saved.extraVisits.length) {
      db.visits = [...saved.extraVisits, ...db.visits];
    }
  } catch {
  }
}
function reset() {
  db.tasks = [];
  db.tickets = [];
  db.diagnoses = {};
  db.uploads = {};
  db.visits = clone(visits);
  db.stores = clone(stores);
  db.users = clone(users);
  try {
    localStorage.removeItem(DB_KEY);
  } catch {
  }
}
function findStore(id) {
  return db.stores.find((s) => s.id === id);
}
function findUser(id) {
  return db.users.find((u) => u.id === id);
}
function findUserByRole(role) {
  return db.users.find((u) => u.role === role);
}
function findDiagnosisRaw(key) {
  return staticDiagnosesRaw.find((d) => d.key === key);
}
var VISIT_TO_RAW_KEY = {
  V_S1_001: "S1",
  V_S2_002: "S2",
  V_S2_001: "S2_BEFORE",
  V_S3_001: "S3",
  V_S4_001: "S4",
  V_S5_001: "S5"
};
var STORE_TO_RAW_KEY = {
  S1: "S1",
  S2: "S2",
  S3: "S3",
  S4: "S4",
  S5: "S5"
};
function serial(prefix) {
  const now = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  return `${prefix}${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${Math.floor(Math.random() * 900 + 100)}`;
}
function createTask(payload) {
  const store = findStore(payload.storeId);
  const assignee = findUser(payload.assigneeId);
  const mgr = findUserByRole("manager");
  const typeMeta = {
    OOS: "\u7F3A\u8D27\u8865\u8D27",
    FACING: "\u6392\u9762\u8C03\u6574",
    PRICETAG: "\u4EF7\u7B7E\u6574\u6539",
    STACK: "\u5806\u5934\u6267\u884C"
  };
  const task = {
    id: uid("TSK"),
    storeId: payload.storeId,
    storeName: store?.name ?? "",
    assigneeId: payload.assigneeId,
    assigneeName: assignee?.name ?? "\u674E\u5F3A",
    creatorId: mgr?.id ?? "U_MGR",
    creatorName: mgr?.name ?? "\u738B\u654F",
    taskType: payload.taskType,
    taskTypeLabel: typeMeta[payload.taskType] ?? "\u6574\u6539\u4EFB\u52A1",
    dueAt: payload.dueAt,
    note: payload.note,
    status: "open"
  };
  db.tasks = [task, ...db.tasks];
  persist();
  return task;
}
function createTicket(payload) {
  const store = findStore(payload.storeId);
  const items = payload.items ?? [];
  const placements = payload.placements ?? [];
  const ticket = {
    id: serial(payload.kind === "order" ? "PO" : "RC"),
    kind: payload.kind,
    storeId: payload.storeId,
    storeName: store?.name ?? "",
    items,
    placements,
    // 合计优先取调用方传入的权威值（与 P4 行动方案保持一致），缺省才按明细求和
    totalBottles: payload.totalBottles ?? items.reduce((s, i) => s + i.bottles, 0),
    totalAmount: payload.totalAmount ?? items.reduce((s, i) => s + i.amount, 0),
    note: payload.note ?? "",
    createdAt: (/* @__PURE__ */ new Date()).toISOString().slice(0, 16).replace("T", " ")
  };
  db.tickets = [ticket, ...db.tickets];
  persist();
  return ticket;
}
function createVisit(storeId, photoIds, score) {
  const store = findStore(storeId);
  const sameStore = db.visits.filter((v) => v.storeId === storeId);
  const nextNo = sameStore.reduce((m, v) => Math.max(m, v.visitNo), 0) + 1;
  const now = /* @__PURE__ */ new Date();
  const pad = (n) => String(n).padStart(2, "0");
  const visit = {
    id: uid("V_T"),
    storeId,
    storeName: store?.name ?? "",
    repId: "U_REP",
    visitedAt: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}`,
    visitNo: nextNo,
    photoIds,
    score,
    status: "done"
  };
  db.visits = [visit, ...db.visits];
  persist();
  return visit;
}

// src/api/error.ts
var ApiError2 = class extends Error {
  /**
   * @param code 业务码（非 0 视为业务错误）
   * @param message 友好提示文案（绝不直接展示浏览器原生报错）
   */
  constructor(code, message) {
    super(message);
    this.code = code;
    this.name = "ApiError";
  }
};

// src/domain/constants.ts
var HEALTH_LEVELS = [
  { key: "excellent", min: 85, max: 100, label: "\u4F18\u79C0", color: "#009639", icon: "\u2713", advice: "\u4FDD\u6301\u5F53\u524D\u9648\u5217\u6C34\u5E73" },
  { key: "good", min: 70, max: 84, label: "\u826F\u597D", color: "#8BC34A", icon: "\u25D0", advice: "\u6709\u5C0F\u95EE\u9898\uFF0C\u672C\u5468\u5185\u5904\u7406" },
  { key: "warning", min: 60, max: 69, label: "\u9884\u8B66", color: "#FF9800", icon: "\u25B3", advice: "\u9700\u7ACB\u5373\u5904\u7406\uFF0C\u5426\u5219\u5F71\u54CD\u9500\u91CF" },
  { key: "risk", min: 0, max: 59, label: "\u98CE\u9669", color: "#E02020", icon: "\u2716", advice: "\u7EA2\u8272\u544A\u8B66\uFF0C24 \u5C0F\u65F6\u5185\u6574\u6539" }
];
var DIMENSIONS = [
  { key: "D1", name: "\u6392\u9762\u8FBE\u6807", weight: 0.3 },
  { key: "D2", name: "\u7F3A\u8D27\u63A7\u5236", weight: 0.25 },
  { key: "D3", name: "\u4EF7\u7B7E\u5408\u89C4", weight: 0.15 },
  { key: "D4", name: "\u7ADE\u4E89\u4F4D\u52BF", weight: 0.15 },
  { key: "D5", name: "\u9648\u5217\u6267\u884C", weight: 0.1 },
  { key: "D6", name: "\u671F\u6548\u65B0\u9C9C", weight: 0.05 }
];
var RISK = {
  /** 排面弹性系数 */
  ELASTICITY: 0.35,
  /** 缺口系数 */
  GAP_FACTOR: 1,
  WEEK_DAYS: 7,
  MONTH_WEEKS: 4.3
};
var DEMO_TODAY = "2026-10-02";
var DEMO_WEEKDAY = "\u5468\u4E94";
var DEMO_WEATHER = "\u6674 22\u2103";
function levelOf(score) {
  const hit = HEALTH_LEVELS.find((l) => score >= l.min && score <= l.max);
  return hit?.key ?? "risk";
}
function colorOf(level) {
  const hit = HEALTH_LEVELS.find((l) => l.key === level);
  return hit ? hit.color : "#9CA3AF";
}

// src/domain/healthScore.ts
function clamp(n, min, max) {
  return Math.min(max, Math.max(min, n));
}
function createEmptyScoreInput(standard) {
  return {
    standard,
    coldFacings: standard.coldCols,
    ambientFacings: standard.ambientCols,
    stackFacings: standard.stacks,
    oosSkuCount: 0,
    lowStockSkuCount: 0,
    priceTagMissing: 0,
    priceMismatch: 0,
    competitorFacings: 0,
    mengniuFacings: standard.coldCols + standard.ambientCols,
    goldenCompetitorCols: 0,
    materialsDone: 0,
    materialsRequired: 0,
    nearExpiryCount: 0,
    expiredCount: 0
  };
}
function scoreD1(i) {
  const rCold = i.coldFacings / Math.max(1, i.standard.coldCols);
  const rAmb = i.ambientFacings / Math.max(1, i.standard.ambientCols);
  const rStk = i.standard.stacks > 0 ? i.stackFacings / i.standard.stacks : 1;
  return clamp(Math.round((rCold * 0.5 + rAmb * 0.3 + rStk * 0.2) * 100), 0, 100);
}
function scoreD2(i) {
  return clamp(100 - i.oosSkuCount * 12 - i.lowStockSkuCount * 5, 0, 100);
}
function scoreD3(i) {
  return clamp(100 - i.priceTagMissing * 8 - i.priceMismatch * 5, 0, 100);
}
function scoreD4(i) {
  const share = i.mengniuFacings / Math.max(1, i.mengniuFacings + i.competitorFacings);
  return clamp(Math.round(share * 100) - i.goldenCompetitorCols * 15, 0, 100);
}
function scoreD5(i) {
  if (i.materialsRequired === 0) return 100;
  return clamp(Math.round(i.materialsDone / i.materialsRequired * 100), 0, 100);
}
function scoreD6(i) {
  if (i.nearExpiryCount === 0 && i.expiredCount === 0) return 85;
  return clamp(100 - i.nearExpiryCount * 20 - i.expiredCount * 50, 0, 100);
}
var SCORERS = [scoreD1, scoreD2, scoreD3, scoreD4, scoreD5, scoreD6];
function estimateAfterFix(score) {
  return clamp(Math.round(score + (100 - score) * 0.6), 89, 96);
}
function computeHealth(input) {
  const raw = SCORERS.map((fn) => fn(input));
  const score = Math.round(raw.reduce((s, v, k) => s + v * DIMENSIONS[k].weight, 0));
  const level = levelOf(score);
  return {
    score,
    level,
    color: colorOf(level),
    delta: 0,
    expectedScore: estimateAfterFix(score),
    source: "computed"
  };
}
function resolveHealth(input, fixture) {
  if (fixture && Array.isArray(fixture.dimensions) && fixture.dimensions.length === 6) {
    const dims = fixture.dimensions;
    const weighted = dims.reduce((s, v, k) => s + v * DIMENSIONS[k].weight, 0);
    const score = fixture.scoreOverride != null ? Math.round(fixture.scoreOverride) : Math.round(weighted);
    const level = levelOf(score);
    return {
      health: {
        score,
        level,
        color: colorOf(level),
        delta: fixture.prevScore != null ? score - fixture.prevScore : 0,
        expectedScore: fixture.expectedScore ?? estimateAfterFix(score),
        source: "fixture"
      },
      dimensions: DIMENSIONS.map((d, k) => ({
        key: d.key,
        name: d.name,
        weight: d.weight,
        score: Math.round(dims[k]),
        level: levelOf(Math.round(dims[k]))
      }))
    };
  }
  const health = computeHealth(input);
  return {
    health,
    dimensions: DIMENSIONS.map((d, k) => ({
      key: d.key,
      name: d.name,
      weight: d.weight,
      score: SCORERS[k](input),
      level: levelOf(SCORERS[k](input))
    }))
  };
}
function buildScoreInputFromStat(standard, stat) {
  const effective = Math.max(1, stat.skuCount);
  return {
    standard,
    coldFacings: Math.max(0, standard.coldCols - stat.emptyCount - stat.competitorCount),
    ambientFacings: Math.round(standard.ambientCols * 0.8),
    stackFacings: 0,
    oosSkuCount: stat.emptyCount,
    lowStockSkuCount: stat.oosCount,
    priceTagMissing: stat.priceTagMissing,
    priceMismatch: stat.priceMismatch,
    competitorFacings: stat.competitorCount,
    mengniuFacings: effective,
    goldenCompetitorCols: Math.min(2, stat.competitorCount),
    materialsDone: 0,
    materialsRequired: stat.competitorCount > 2 ? 1 : 0,
    nearExpiryCount: 0,
    expiredCount: 0
  };
}

// src/domain/riskForecast.ts
function avgUnitPrice(list) {
  if (!list.length) return 0;
  return list.reduce((s, i) => s + i.unitPrice, 0) / list.length;
}
function buildDerivation(list, weeklyBottles, weeklyAmount, monthlyBottles, monthlyAmount) {
  const lines = ["\u901A\u7528\u9648\u5217\u89C4\u5219\u515C\u5E95\u8BC6\u522B\uFF1A\u672C\u5E97\u672A\u5339\u914D\u9884\u7F6E\u95E8\u5E97\u6863\u6848\uFF0C\u6309\u540C\u7C7B\u95E8\u5E97\u6807\u51C6\u6D4B\u7B97\u3002"];
  list.forEach((it, idx) => {
    lines.push(
      `\u2460 \u6392\u9762\u7F3A\u53E3\uFF1A${it.skuName} \u6807\u51C6\u6392\u9762 ${it.stdFacings} \u5217\uFF0C\u5B9E\u9645\u6709\u6548 ${it.actualFacings} \u5217 \u2192 \u7F3A\u53E3\u5360\u6BD4 (${it.stdFacings} \u2212 ${it.actualFacings}) \xF7 ${it.stdFacings} = ${(it.gapRatio * 100).toFixed(1)}%`
    );
    lines.push(`\u2461 \u52A8\u9500\u57FA\u51C6\uFF1A${it.skuName} \u8FD1 4 \u5468\u65E5\u5747\u52A8\u9500 ${it.dailyAvgSales} \u74F6/\u5929`);
    lines.push(
      `\u2462 \u5F39\u6027\u5047\u8BBE\uFF1A\u6BCF\u51CF\u5C11 1 \u5217\u6392\u9762 \u2248 \u635F\u5931 ${Math.round(it.elasticity * 100)}% \u5355\u5217\u52A8\u9500\uFF08\u6392\u9762\u5F39\u6027\u7CFB\u6570 ${it.elasticity}\uFF09`
    );
    lines.push(
      `\u2463 \u65E5\u5747\u6F5C\u5728\u635F\u5931 = ${it.dailyAvgSales} \xD7 ${(it.gapRatio * 100).toFixed(1)}% \xD7 ${it.elasticity} \u2248 ${it.dailyLossBottles} \u74F6/\u5929`
    );
    if (idx === list.length - 1) {
      lines.push(`\u2464 \u672C\u5468\u9884\u8BA1\u6D41\u5931 \u2248 ${weeklyBottles} \u74F6\uFF1B\u6309\u96F6\u552E\u6307\u5BFC\u4EF7 \xA5${it.unitPrice}/\u74F6 \u2192 \u7EA6 \xA5${weeklyAmount}`);
      lines.push(`\u2465 \u6708\u5EA6\u9884\u8BA1\u6D41\u5931 = ${weeklyBottles} \xD7 ${RISK.MONTH_WEEKS} \u2248 ${monthlyBottles} \u74F6 \u2192 \u7EA6 \xA5${monthlyAmount}`);
    }
  });
  lines.push("\u5047\u8BBE\u8BF4\u660E\uFF1A\u9ED8\u8BA4\u5BA2\u6D41\u4E0E\u8FD1 4 \u5468\u6301\u5E73\u3001\u671F\u95F4\u4E0D\u8865\u8D27\u4E14\u4E0D\u8C03\u6574\u9648\u5217\u3002");
  return lines.join("\n");
}
function predictRisk(items) {
  const list = items.map((it) => {
    const gapRatio = round1((it.stdFacings - it.actualFacings) / Math.max(1, it.stdFacings), 3);
    const dailyLoss = it.dailyAvgSales * (gapRatio * RISK.GAP_FACTOR) * RISK.ELASTICITY;
    return {
      ...it,
      gapRatio,
      elasticity: RISK.ELASTICITY,
      dailyLossBottles: round1(dailyLoss)
    };
  });
  const price = avgUnitPrice(list);
  const weeklyBottles = Math.round(list.reduce((s, i) => s + i.dailyLossBottles, 0) * RISK.WEEK_DAYS);
  const weeklyAmount = Math.round(weeklyBottles * price);
  const monthlyBottles = Math.round(weeklyBottles * RISK.MONTH_WEEKS);
  const monthlyAmount = Math.round(monthlyBottles * price);
  return {
    weeklyBottles,
    weeklyAmount,
    monthlyBottles,
    monthlyAmount,
    items: list,
    derivation: buildDerivation(list, weeklyBottles, weeklyAmount, monthlyBottles, monthlyAmount)
  };
}
function resolveRisk(fixture) {
  const weeklyBottles = Math.round(fixture.weeklyBottles ?? 0);
  const weeklyAmount = Math.round(fixture.weeklyAmount ?? 0);
  const monthlyBottles = Math.round(fixture.monthlyBottles ?? weeklyBottles * RISK.MONTH_WEEKS);
  const monthlyAmount = Math.round(fixture.monthlyAmount ?? weeklyAmount * RISK.MONTH_WEEKS);
  return {
    weeklyBottles,
    weeklyAmount,
    monthlyBottles,
    monthlyAmount,
    items: fixture.items ?? [],
    derivation: fixture.derivation ?? ""
  };
}

// src/domain/issueBuilder.ts
var SEVERITY_ORDER = { severe: 0, medium: 1, low: 2 };
function sortIssues(issues) {
  return [...issues].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}
function buildIssues(summary, annotations, skus2) {
  const list = [];
  const skuNameOf = (id) => skus2.find((s) => s.id === id)?.name ?? "\u8499\u725B\u5546\u54C1";
  const idsOf = (layer) => annotations.filter((a) => a.layer === layer).map((a) => a.id);
  const emptyIds = idsOf("empty");
  if (emptyIds.length > 0) {
    list.push({
      id: "GEN_OOS",
      severity: "severe",
      title: `\u8D27\u67B6\u51FA\u73B0 ${emptyIds.length} \u5904\u6574\u5217\u7A7A\u4F4D`,
      location: `\u51B7\u85CF\u67DC \xB7 \u5E94\u9648\u5217 ${skuNameOf(annotations.find((a) => a.layer === "empty")?.skuId)}`,
      impact: "\u5F71\u54CD\uFF1A\u7F3A\u4F4D\u671F\u95F4\u8BE5\u5217\u52A8\u9500\u76F4\u63A5\u5F52\u96F6",
      actions: ["\u7ACB\u5373\u8865\u8D27", "\u6807\u8BB0\u5DF2\u5904\u7406"],
      relatedAnnotationIds: emptyIds
    });
  }
  const competitorIds = idsOf("competitor");
  if (competitorIds.length > 0) {
    list.push({
      id: "GEN_COMPETITOR",
      severity: "severe",
      title: `\u7ADE\u54C1\u5360\u7528 ${competitorIds.length} \u4E2A\u9EC4\u91D1\u5217\u4F4D`,
      location: "\u51B7\u85CF\u67DC\u9EC4\u91D1\u89C6\u7EBF\u5C42 \xB7 \u8499\u725B\u6392\u9762\u88AB\u6324\u538B",
      impact: "\u5F71\u54CD\uFF1A\u9EC4\u91D1\u5C42\u4E0E\u5E95\u5C42\u5355\u5217\u52A8\u9500\u76F8\u5DEE\u7EA6 2.1 \u500D",
      actions: ["\u67E5\u770B\u7ADE\u4E89\u8BDD\u672F"],
      relatedAnnotationIds: competitorIds
    });
  }
  const priceCount = (summary?.priceTagCount ?? 0) || idsOf("pricetag").length;
  if (priceCount > 0) {
    list.push({
      id: "GEN_PRICETAG",
      severity: "medium",
      title: `\u4EF7\u7B7E\u95EE\u9898 ${priceCount} \u5904`,
      location: "\u51B7\u85CF\u67DC \xB7 \u4EF7\u7B7E\u7F3A\u5931\u6216\u4EF7\u683C\u4E0D\u7B26",
      impact: "\u5F71\u54CD\uFF1A\u987E\u5BA2\u65E0\u6CD5\u6BD4\u4EF7\uFF0C\u8F6C\u5316\u7387\u4E0B\u964D",
      actions: ["\u6253\u5370\u4EF7\u7B7E"],
      relatedAnnotationIds: idsOf("pricetag")
    });
  }
  const oosIds = idsOf("oos");
  if (oosIds.length > 0) {
    list.push({
      id: "GEN_LOWSTOCK",
      severity: "medium",
      title: `${oosIds.length} \u4E2A SKU \u6392\u9762\u4E0D\u8DB3`,
      location: "\u51B7\u85CF\u67DC \xB7 \u4F4E\u4E8E\u5B89\u5168\u5E93\u5B58 50%",
      impact: "\u5F71\u54CD\uFF1A\u9AD8\u5CF0\u671F\u5B58\u5728\u65AD\u8D27\u98CE\u9669",
      actions: ["\u8865\u5230\u6EE1\u6392"],
      relatedAnnotationIds: oosIds
    });
  }
  const stackIds = idsOf("stack");
  if (stackIds.length > 0) {
    list.push({
      id: "GEN_STACK",
      severity: "medium",
      title: "\u672C\u6708\u8054\u5408\u5806\u5934\u672A\u6267\u884C",
      location: "\u95E8\u5E97\u5165\u53E3\u533A \xB7 \u6D3B\u52A8\u7269\u6599\u672A\u843D\u5730",
      impact: "\u5F71\u54CD\uFF1A\u6D3B\u52A8\u671F\u635F\u5931\u589E\u91CF\u9500\u552E",
      actions: ["\u7533\u8BF7\u7269\u6599"],
      relatedAnnotationIds: stackIds
    });
  }
  return sortIssues(list);
}

// src/domain/planBuilder.ts
var STORE_TYPE_PARAMS = {
  A: { label: "\u8BE5\u5E97\u7C7B\u578B\u4E3A A\u7C7B\u8FDE\u9501\u8D85\u5E02", colCapacity: 8, coverDays: 4, factor: 1.2 },
  B: { label: "\u8BE5\u5E97\u7C7B\u578B\u4E3A B\u7C7B\u5927\u5356\u573A", colCapacity: 10, coverDays: 3, factor: 1 },
  C: { label: "\u8BE5\u5E97\u7C7B\u578B\u4E3A C\u7C7B\u4FBF\u5229", colCapacity: 6, coverDays: 3, factor: 0.8 }
};
function paramsOf(type) {
  return STORE_TYPE_PARAMS[type] ?? STORE_TYPE_PARAMS.C;
}
function buildPlan(store, skus2, gapCols = 1, dailyAvgSales = 11) {
  const p = paramsOf(store.type);
  const candidates = skus2.filter((s) => s.brand === "\u8499\u725B");
  const picks = candidates.slice(0, 3);
  const bottleBase = Math.max(gapCols, 1) * p.colCapacity;
  const safety = Math.round(dailyAvgSales * p.coverDays * 0.3);
  const restock = picks.map((sku, idx) => {
    const bottles = Math.max(1, Math.round((bottleBase - idx * 3) * p.factor + (idx === 0 ? safety : 0)));
    return {
      skuId: sku.id,
      skuName: sku.name,
      bottles,
      amount: Math.round(bottles * sku.guidePrice)
    };
  });
  const placement = [
    { text: `\u4E3B\u63A8 SKU \u4E0A\u79FB\u81F3\u9EC4\u91D1\u89C6\u7EBF\u5C42\uFF08\u51B7\u67DC\u7B2C 2 \u5C42\uFF0C1.2\u20131.6m\uFF09` },
    { text: `\u540C\u54C1\u724C\u96C6\u4E2D\u8FDE\u6392\uFF0C\u5F62\u6210 ${Math.max(2, p.colCapacity / 2)} \u5217\u4EE5\u4E0A\u7684\u9648\u5217\u9762` }
  ];
  return {
    storeTypeLabel: p.label,
    restock,
    placement,
    totalBottles: restock.reduce((s, i) => s + i.bottles, 0),
    totalAmount: restock.reduce((s, i) => s + i.amount, 0),
    coverDays: p.coverDays
  };
}
function resolvePlan(fixture, fallbackLabel = "\u8BE5\u5E97\u7C7B\u578B\u4E3A C\u7C7B\u4FBF\u5229") {
  const restock = fixture?.restock ?? [];
  const placement = fixture?.placement ?? [];
  const totalBottles = fixture?.totalBottles ?? restock.reduce((s, i) => s + i.bottles, 0);
  const totalAmount = fixture?.totalAmount ?? restock.reduce((s, i) => s + i.amount, 0);
  return {
    storeTypeLabel: fixture?.storeTypeLabel || fallbackLabel,
    restock,
    placement,
    totalBottles,
    totalAmount,
    coverDays: fixture?.coverDays ?? 3
  };
}
function buildPlacementsFromIssues(issues, maxCount = 2) {
  const texts = [];
  issues.forEach((it) => {
    if (it.relatedAnnotationIds?.length && /空位|缺货/.test(it.title)) {
      texts.push(`\u4F18\u5148\u8865\u4F4D\uFF1A${it.location}`);
    } else if (/竞品/.test(it.title)) {
      texts.push(`\u4E89\u53D6\u62FF\u56DE\u9EC4\u91D1\u5217\u4F4D\uFF1A${it.location}`);
    } else if (/价签/.test(it.title)) {
      texts.push(`\u8865\u6253\u5E76\u6821\u6B63\u4EF7\u7B7E\uFF1A${it.location}`);
    }
  });
  return texts.slice(0, maxCount).map((t) => ({ text: t }));
}

// src/domain/llmAdapter.ts
var FLAG_KEY = "store-app:llm";
function enabled() {
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem(FLAG_KEY) === "1";
  } catch {
    return false;
  }
}
function tryAsk(_message, _ctx) {
  if (!enabled()) return null;
  return null;
}
var askLLM = { enabled, tryAsk };

// src/domain/chatEngine.ts
var HIT_THRESHOLD = 2;
function normalize(input) {
  return (input ?? "").toLowerCase().replace(/[\s\p{P}\p{S}]/gu, "").trim();
}
function scoreOf(normed, item) {
  let score = 0;
  item.keywords.forEach((kw) => {
    const k = normalize(kw);
    if (!k) return;
    if (normed.includes(k)) {
      score += 1 + Math.min(1, k.length / 6);
    }
  });
  if (normalize(item.question) === normed) score += 3;
  return score;
}
function reply(message, ctx) {
  const { options } = ctx;
  const normed = normalize(message);
  if (!normed) {
    return {
      reply: options.fallback.empty,
      suggestions: options.fallback.recommend
    };
  }
  let best = null;
  let bestScore = 0;
  options.items.forEach((item) => {
    const s = scoreOf(normed, item);
    if (s > bestScore) {
      bestScore = s;
      best = item;
    }
  });
  if (best && bestScore >= HIT_THRESHOLD) {
    return {
      answerId: best.id,
      reply: best.reply,
      highlightSection: best.highlightSection ?? void 0,
      suggestions: options.suggestions.slice(0, 3)
    };
  }
  if (askLLM.enabled()) {
    const remote = askLLM.tryAsk(message, ctx);
    if (remote) {
      return { reply: remote, suggestions: options.suggestions.slice(0, 3) };
    }
  }
  return {
    reply: options.fallback.miss,
    suggestions: options.fallback.recommend
  };
}

// src/api/mock/handlers.ts
restore();
function seedDefaultTasks() {
  if (db.tasks.length > 0) return;
  const store = findStore("S5");
  const task = {
    id: "TSK_DEMO_S5",
    storeId: "S5",
    storeName: store?.name ?? "\u6C38\u8F89\u751F\u6D3B\xB7\u4E2D\u592E\u516C\u56ED\u5E97",
    assigneeId: "U_REP",
    assigneeName: "\u674E\u5F3A",
    creatorId: "U_MGR",
    creatorName: "\u738B\u654F",
    taskType: "OOS",
    taskTypeLabel: "\u7F3A\u8D27\u8865\u8D27",
    dueAt: "\u4ECA\u65E5 18:00",
    note: "\u8BE5\u5E97\u4F18\u76CAC \u65AD\u8D27 3 \u5929\u4EE5\u4E0A\uFF0C\u5DF2\u8FDE\u7EED 3 \u5468\u4E0B\u6ED1\uFF0C\u8BF7\u5728\u4ECA\u65E5 18:00 \u524D\u5B8C\u6210\u7F3A\u8D27\u6574\u6539\u5E76\u56DE\u4F20\u7167\u7247\u3002",
    status: "open"
  };
  db.tasks = [task];
  persist();
}
seedDefaultTasks();
function buildFixtureDiagnosis(rawKey) {
  const raw = findDiagnosisRaw(rawKey);
  if (!raw) throw new ApiError2(404, "\u672A\u627E\u5230\u8BE5\u95E8\u5E97\u7684\u8BCA\u65AD\u6570\u636E");
  const store = findStore(raw.storeId);
  const { health, dimensions } = resolveHealth(createEmptyScoreInput(store.standard), {
    dimensions: raw.dimensions,
    expectedScore: raw.expectedScore,
    prevScore: raw.prevScore,
    scoreOverride: raw.scoreOverride
  });
  const issues = sortIssues(
    raw.issues.map((i) => ({
      id: `${raw.key}_${i.id}`,
      severity: i.severity,
      title: i.title,
      location: i.location,
      impact: i.impact,
      actions: i.actions,
      relatedAnnotationIds: i.relatedAnnotationIds
    }))
  );
  return {
    id: `D_${raw.key}`,
    visitId: raw.visitId ?? void 0,
    storeId: raw.storeId,
    storeName: raw.storeName,
    createdAt: raw.createdAt,
    visitNo: raw.visitNo,
    photoUrl: raw.photoUrl,
    shootTypes: raw.shootTypes,
    steps: buildSteps(raw.summary, store.typeLabel),
    summary: raw.summary,
    annotations: raw.annotations.map((a) => ({ ...a, layer: a.layer })),
    dimensions,
    health,
    issues,
    risk: resolveRisk(raw.risk),
    plan: resolvePlan(raw.plan, `${store.typeLabel}`)
  };
}
function buildFallbackDiagnosis(payload) {
  const store = findStore(payload.storeId);
  if (!store) throw new ApiError2(404, "\u672A\u627E\u5230\u8BE5\u95E8\u5E97");
  const photoUrl = db.uploads[payload.photoIds?.[0]] || store.photos[0]?.url || "/stores/fallback/generic-shelf.jpg";
  const standard = store.standard;
  const stat = {
    emptyCount: 1,
    oosCount: 1,
    priceTagMissing: 1,
    priceMismatch: 0,
    competitorCount: 1,
    skuCount: Math.max(1, standard.coldCols)
  };
  const annotations = [
    {
      id: "FB01",
      layer: "mengniu",
      x: 3,
      y: 27,
      w: 30,
      h: 13,
      label: "\u8499\u725B\u5546\u54C1 \u2714\u8BC6\u522B\u6B63\u5E38"
    },
    {
      id: "FB02",
      layer: "empty",
      x: 35,
      y: 27,
      w: 24,
      h: 13,
      label: "\u7A7A\u4F4D \u2716\u7F3A\u8D27"
    },
    {
      id: "FB03",
      layer: "competitor",
      x: 61,
      y: 27,
      w: 28,
      h: 13,
      label: "\u7ADE\u54C1 \u26A0\u5360\u4F4D"
    },
    { id: "FB04", layer: "pricetag", x: 3, y: 37.5, w: 18, h: 5, label: "\u2716 \u4EF7\u7B7E\u7F3A\u5931" }
  ];
  const summary = {
    total: annotations.length,
    skuCount: stat.skuCount,
    emptyCount: stat.emptyCount,
    competitorCount: stat.competitorCount,
    priceTagCount: stat.priceTagMissing + stat.priceMismatch,
    stackCount: 0,
    text: "\u2726 AI \u8BC6\u522B\u6458\u8981\uFF1A\u672A\u5339\u914D\u5230\u9884\u7F6E\u95E8\u5E97\u7ED3\u679C\uFF0C\u5DF2\u4F7F\u7528\u901A\u7528\u9648\u5217\u89C4\u5219\u8BC6\u522B"
  };
  const input = buildScoreInputFromStat(standard, stat);
  const { health, dimensions } = resolveHealth(input, null);
  const issues = buildIssues(summary, annotations, staticSkus);
  const topSku = staticSkus.find((s) => s.brand === "\u8499\u725B") ?? staticSkus[0];
  const risk = predictRisk([
    {
      skuId: topSku.id,
      skuName: topSku.name,
      dailyAvgSales: 10,
      stdFacings: standard.coldCols || 4,
      actualFacings: Math.max(0.5, (standard.coldCols || 4) - stat.emptyCount - stat.competitorCount),
      unitPrice: topSku.guidePrice
    }
  ]);
  const plan = buildPlan(store, staticSkus, stat.emptyCount + stat.competitorCount, 10);
  plan.placement = buildPlacementsFromIssues(issues, 2);
  const diagnosis = {
    id: `D_UNKNOWN_${uid("")}`,
    storeId: store.id,
    storeName: store.name,
    createdAt: `${DEMO_TODAY} 10:24`,
    visitNo: (db.visits.filter((v) => v.storeId === store.id).reduce((m, v) => Math.max(m, v.visitNo), 0) || 0) + 1,
    photoUrl,
    shootTypes: payload.shootTypes ?? ["cold"],
    steps: [
      { text: "\u6B63\u5728\u4E0A\u4F20\u8D27\u67B6\u7167\u7247\u2026", delayMs: 480 },
      { text: `\u5DF2\u8BC6\u522B ${annotations.length} \u4E2A\u76EE\u6807\uFF08\u901A\u7528\u9648\u5217\u89C4\u5219\uFF09`, delayMs: 480 },
      { text: `\u6B63\u5728\u6BD4\u5BF9\u300C${store.typeLabel}\u9648\u5217\u6807\u51C6\u300D\u2026`, delayMs: 480 },
      { text: "\u6B63\u5728\u7ED3\u5408\u8FD1 4 \u5468\u52A8\u9500\u6570\u636E\u63A8\u7406\u2026", delayMs: 480 },
      { text: "\u8BCA\u65AD\u5B8C\u6210", delayMs: 480 }
    ],
    summary,
    annotations,
    dimensions,
    health: { ...health, expectedScore: estimateAfterFix(health.score) },
    issues,
    risk,
    plan
  };
  db.diagnoses[diagnosis.id] = diagnosis;
  return diagnosis;
}
function buildSteps(summary, typeLabel) {
  return [
    { text: "\u6B63\u5728\u4E0A\u4F20\u8D27\u67B6\u7167\u7247\u2026", delayMs: 480 },
    {
      text: `\u5DF2\u8BC6\u522B ${summary.total} \u4E2A\u76EE\u6807\uFF1ASKU ${summary.skuCount} / \u7A7A\u4F4D ${summary.emptyCount} / \u7ADE\u54C1 ${summary.competitorCount} / \u4EF7\u7B7E ${summary.priceTagCount}`,
      delayMs: 480
    },
    { text: `\u6B63\u5728\u6BD4\u5BF9\u300C${typeLabel}\u9648\u5217\u6807\u51C6\u300D\u2026`, delayMs: 480 },
    { text: "\u6B63\u5728\u7ED3\u5408\u8FD1 4 \u5468\u52A8\u9500\u6570\u636E\u63A8\u7406\u2026", delayMs: 480 },
    { text: "\u8BCA\u65AD\u5B8C\u6210", delayMs: 480 }
  ];
}
function isTodayDone(storeId) {
  return db.visits.find(
    (v) => v.storeId === storeId && v.status === "done" && (v.visitedAt.startsWith(DEMO_TODAY) || v.id.startsWith("V_T"))
  );
}
var routes = [
  /* ① GET /api/v1/meta/roles —— P1 三角色卡 */
  {
    method: "GET",
    pattern: /^\/api\/v1\/meta\/roles$/,
    handler: () => ({ roles: roleOptions })
  },
  /* ② POST /api/v1/session/login —— 模拟登录 / 切换角色 */
  {
    method: "POST",
    pattern: /^\/api\/v1\/session\/login$/,
    handler: (_p, body) => {
      const roleId = body?.roleId ?? "rep";
      const user = findUserByRole(roleId);
      if (!user) throw new ApiError2(400, "\u89D2\u8272\u4E0D\u5B58\u5728");
      return { token: `demo-token-${roleId}`, user };
    }
  },
  /* ③ GET /api/v1/stores —— 门店列表 */
  {
    method: "GET",
    pattern: /^\/api\/v1\/stores$/,
    handler: () => ({ stores: db.stores })
  },
  /* ④ GET /api/v1/stores/:id —— 门店详情 */
  {
    method: "GET",
    pattern: /^\/api\/v1\/stores\/([^/]+)$/,
    handler: (p) => {
      const store = findStore(p.id);
      if (!store) throw new ApiError2(404, "\u95E8\u5E97\u4E0D\u5B58\u5728");
      return { store };
    }
  },
  /* ⑤ GET /api/v1/visits/today —— P2 今日巡店首页 */
  {
    method: "GET",
    pattern: /^\/api\/v1\/visits\/today$/,
    handler: (p) => {
      const repId = p.repId || "U_REP";
      const order = ["S1", "S2", "S3", "S4", "S5"];
      const routeStores = order.map((id, idx) => {
        const store = findStore(id);
        const done = isTodayDone(id);
        const isReview = id === "S2";
        return {
          store,
          order: idx + 1,
          status: store.alert ? "alert" : done ? "done" : "pending",
          visitId: done?.id,
          isReview
        };
      });
      const doneStores = routeStores.filter((r) => r.status === "done");
      const scores = doneStores.map((r) => r.store.prevScore != null && r.isReview ? r.store.lastScore : r.store.lastScore);
      const avgScore = scores.length ? Math.round(scores.reduce((s, v) => s + v, 0) / scores.length * 10) / 10 : 0;
      const todoTasks = db.tasks.filter((t) => t.assigneeId === repId && t.status === "open");
      const payload = {
        date: `${DEMO_TODAY} ${DEMO_WEEKDAY}`,
        weather: DEMO_WEATHER,
        summary: {
          total: routeStores.length,
          done: doneStores.length,
          avgScore,
          // PRD 6.1 口径：平均健康分环比 +2.4
          avgDelta: 2.4
        },
        todoTasks,
        routeStores
      };
      return payload;
    }
  },
  /* ⑥ GET /api/v1/visits —— 巡店记录列表 */
  {
    method: "GET",
    pattern: /^\/api\/v1\/visits$/,
    handler: (p) => {
      const limit = Number(p.limit || 20);
      let list = [...db.visits];
      const storeId = p.storeId;
      if (storeId) list = list.filter((v) => v.storeId === storeId);
      list.sort((a, b) => a.visitedAt < b.visitedAt ? 1 : -1);
      return { visits: list.slice(0, limit) };
    }
  },
  /* ⑦ GET /api/v1/visits/:id —— 巡店详情（含诊断，P4 只读历史态） */
  {
    method: "GET",
    pattern: /^\/api\/v1\/visits\/([^/]+)$/,
    handler: (p) => {
      const visit = db.visits.find((v) => v.id === p.id);
      if (!visit) throw new ApiError2(404, "\u5DE1\u5E97\u8BB0\u5F55\u4E0D\u5B58\u5728");
      const rawKey = VISIT_TO_RAW_KEY[visit.id] ?? STORE_TO_RAW_KEY[visit.storeId];
      const diagnosis = rawKey ? buildFixtureDiagnosis(rawKey) : void 0;
      return { visit, diagnosis };
    }
  },
  /* ⑧ POST /api/v1/visits —— 完成巡店回写 */
  {
    method: "POST",
    pattern: /^\/api\/v1\/visits$/,
    handler: (_p, body) => {
      const payload = body;
      const rawKey = STORE_TO_RAW_KEY[payload.storeId];
      const score = rawKey ? buildFixtureDiagnosis(rawKey).health.score : 72;
      const visit = createVisit(payload.storeId, payload.photoIds ?? [], score);
      return { visit };
    }
  },
  /* ⑨ POST /api/v1/diagnoses —— ★ 拍照 → AI 诊断 */
  {
    method: "POST",
    pattern: /^\/api\/v1\/diagnoses$/,
    handler: (_p, body) => {
      const payload = body ?? {};
      if (!payload.storeId) throw new ApiError2(400, "\u7F3A\u5C11\u95E8\u5E97\u53C2\u6570");
      if (payload.unknownPhoto) {
        return { diagnosis: buildFallbackDiagnosis(payload) };
      }
      const rawKey = STORE_TO_RAW_KEY[payload.storeId];
      if (!rawKey) {
        return { diagnosis: buildFallbackDiagnosis({ ...payload, unknownPhoto: true }) };
      }
      const diagnosis = buildFixtureDiagnosis(rawKey);
      const firstPhotoId = payload.photoIds?.[0];
      if (firstPhotoId && db.uploads[firstPhotoId]) diagnosis.photoUrl = db.uploads[firstPhotoId];
      db.diagnoses[diagnosis.id] = diagnosis;
      return { diagnosis };
    }
  },
  /* ⑩ GET /api/v1/diagnoses/:id —— P4 渲染 / P5 查看 */
  {
    method: "GET",
    pattern: /^\/api\/v1\/diagnoses\/([^/]+)$/,
    handler: (p) => {
      const id = p.id;
      if (db.diagnoses[id]) return { diagnosis: db.diagnoses[id] };
      const rawKey = id.replace(/^D_/, "");
      if (findDiagnosisRaw(rawKey)) return { diagnosis: buildFixtureDiagnosis(rawKey) };
      const keyByStore = STORE_TO_RAW_KEY[rawKey];
      if (keyByStore) return { diagnosis: buildFixtureDiagnosis(keyByStore) };
      throw new ApiError2(404, "\u8BCA\u65AD\u7ED3\u679C\u4E0D\u5B58\u5728\u6216\u5DF2\u8FC7\u671F");
    }
  },
  /* ⑪ POST /api/v1/ai/chat —— ★ 多轮追问 */
  {
    method: "POST",
    pattern: /^\/api\/v1\/ai\/chat$/,
    handler: (_p, body) => {
      const { diagnosisId, message } = body ?? {};
      let diagnosis = null;
      if (diagnosisId) {
        try {
          diagnosis = isStored(diagnosisId) ?? buildFixtureDiagnosis(String(diagnosisId).replace(/^D_/, ""));
        } catch {
          diagnosis = null;
        }
      }
      const store = diagnosis ? findStore(diagnosis.storeId) ?? null : null;
      const options = {
        items: chatQa.items,
        fallback: chatQa.fallback,
        suggestions: chatQa.suggestions
      };
      const res = reply(String(message ?? ""), { store, diagnosis, options });
      return res;
    }
  },
  /* ⑫ GET /api/v1/ai/chat/suggestions —— 快捷问题 chips */
  {
    method: "GET",
    pattern: /^\/api\/v1\/ai\/chat\/suggestions$/,
    handler: () => ({ suggestions: chatQa.suggestions })
  },
  /* ⑬ POST /api/v1/tickets —— 生成整改单 / 订货建议 */
  {
    method: "POST",
    pattern: /^\/api\/v1\/tickets$/,
    handler: (_p, body) => {
      const payload = body ?? {};
      const ticket = createTicket(payload);
      return { ticket };
    }
  },
  /* ⑭ GET /api/v1/tasks —— 业代待办列表 */
  {
    method: "GET",
    pattern: /^\/api\/v1\/tasks$/,
    handler: (p) => {
      const assigneeId = p.assigneeId;
      let list = [...db.tasks];
      if (assigneeId) list = list.filter((t) => t.assigneeId === assigneeId);
      return { tasks: list };
    }
  },
  /* ⑮ POST /api/v1/tasks —— ★ 经理下派任务 */
  {
    method: "POST",
    pattern: /^\/api\/v1\/tasks$/,
    handler: (_p, body) => {
      const payload = body ?? {};
      if (!payload.storeId) throw new ApiError2(400, "\u8BF7\u9009\u62E9\u95E8\u5E97");
      return { task: createTask(payload) };
    }
  },
  /* ⑯ PATCH /api/v1/tasks/:id —— 标记已处理 */
  {
    method: "PATCH",
    pattern: /^\/api\/v1\/tasks\/([^/]+)$/,
    handler: (p, body) => {
      const idx = db.tasks.findIndex((t) => t.id === p.id);
      if (idx < 0) throw new ApiError2(404, "\u4EFB\u52A1\u4E0D\u5B58\u5728");
      db.tasks[idx] = { ...db.tasks[idx], status: body?.status ?? "done" };
      persist();
      return { task: db.tasks[idx] };
    }
  },
  /* ⑰ GET /api/v1/dashboard/overview —— P5 看板一次性取全量 */
  {
    method: "GET",
    pattern: /^\/api\/v1\/dashboard\/overview$/,
    handler: (p) => {
      const regionId = p.regionId || "R_EAST";
      const rows = dashboard.storeRows.map((r) => ({ ...r }));
      return { overview: { ...dashboard, regionId, storeRows: rows } };
    }
  },
  /* 附加演示用：重置演示数据（非 REST 契约，仅供演示设置齿轮） */
  {
    method: "POST",
    pattern: /^\/api\/v1\/demo\/reset$/,
    handler: () => {
      reset();
      seedDefaultTasks();
      return { ok: true };
    }
  }
];
function isStored(id) {
  return db.diagnoses[id] ?? null;
}
function handlers(path, method, body) {
  const cleanPath = path.split("?")[0];
  try {
    for (const r of routes) {
      const m = cleanPath.match(r.pattern);
      if (m && r.method === method) {
        const params = {};
        if (m[1]) params.id = decodeURIComponent(m[1]);
        const qs = path.includes("?") ? path.split("?")[1] : "";
        new URLSearchParams(qs).forEach((v, k) => {
          params[k] = v;
        });
        const data = r.handler(params, body);
        return { code: 0, message: "ok", data };
      }
    }
    return { code: 404, message: `\u63A5\u53E3\u4E0D\u5B58\u5728\uFF1A${method} ${cleanPath}`, data: null };
  } catch (e) {
    const err = e;
    return { code: err.code ?? 500, message: err.message ?? "\u670D\u52A1\u5F02\u5E38", data: null };
  }
}

// src/api/client.ts
var MODE = define_import_meta_env_default.VITE_API_MODE || "mock";
var SPEED = Math.max(1, Number(define_import_meta_env_default.VITE_DEMO_SPEED) || 1);
function withQuery(path, query) {
  if (!query) return path;
  const parts = Object.entries(query).filter(([, v]) => v !== void 0 && v !== null && v !== "").map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `${path}?${parts.join("&")}` : path;
}
function mockLatency(path) {
  if (path.includes("/diagnoses") && path.endsWith("diagnoses")) return 900;
  if (path.includes("/ai/chat")) return 500;
  if (path.includes("/dashboard")) return 600;
  return 300 + Math.round(Math.random() * 300);
}
function sleep(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
async function request(options) {
  const { path, method = "GET", body, query } = options;
  const fullPath = withQuery(path, query);
  if (MODE === "http") {
    return httpRequest(fullPath, method, body);
  }
  return mockRequest(fullPath, method, body);
}
async function mockRequest(fullPath, method, body) {
  await sleep(Math.round(mockLatency(fullPath) * SPEED));
  const envelope = handlers(fullPath, method, body);
  if (envelope.code !== 0) throw new ApiError(envelope.code, envelope.message);
  return envelope.data;
}
async function httpRequest(fullPath, method, body) {
  const base = define_import_meta_env_default.VITE_API_BASE || "";
  try {
    const res = await fetch(`${base}${fullPath}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : void 0
    });
    const envelope = await res.json();
    if (envelope.code !== 0) throw new ApiError(envelope.code, envelope.message);
    return envelope.data;
  } catch (e) {
    console.warn("[api] \u8FDC\u7A0B\u63A5\u53E3\u4E0D\u53EF\u7528\uFF0C\u5DF2\u964D\u7EA7\u5230\u672C\u5730\u6F14\u793A\u6570\u636E\uFF1A", fullPath);
    const envelope = handlers(fullPath, method, body);
    if (envelope.code !== 0) throw new ApiError(envelope.code, envelope.message);
    return envelope.data;
  }
}

// src/api/index.ts
async function getTodayRoute(repId = "U_REP") {
  return request({ path: "/api/v1/visits/today", method: "GET", query: { repId } });
}
async function getVisits(params = {}) {
  return request({ path: "/api/v1/visits", method: "GET", query: params });
}
async function createDiagnosis(payload) {
  return request({
    path: "/api/v1/diagnoses",
    method: "POST",
    body: payload
  });
}
async function getDiagnosis(id) {
  return request({ path: `/api/v1/diagnoses/${id}`, method: "GET" });
}
async function postChat(payload) {
  return request({ path: "/api/v1/ai/chat", method: "POST", body: payload });
}
async function getChatSuggestions(diagnosisId) {
  return request({
    path: "/api/v1/ai/chat/suggestions",
    method: "GET",
    query: { diagnosisId }
  });
}
async function createTicket2(payload) {
  return request({ path: "/api/v1/tickets", method: "POST", body: payload });
}
async function getTasks(assigneeId) {
  return request({ path: "/api/v1/tasks", method: "GET", query: { assigneeId } });
}
async function createTask2(payload) {
  return request({ path: "/api/v1/tasks", method: "POST", body: payload });
}
async function getDashboardOverview(regionId = "R_EAST") {
  return request({
    path: "/api/v1/dashboard/overview",
    method: "GET",
    query: { regionId }
  });
}

// ../_smoke/smoke.ts
var memStore = {};
globalThis.localStorage = {
  getItem: (k) => k in memStore ? memStore[k] : null,
  setItem: (k, v) => {
    memStore[k] = v;
  },
  removeItem: (k) => {
    delete memStore[k];
  }
};
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
  addEventListener: () => void 0,
  removeEventListener: () => void 0
};
var pass = 0;
var fail = 0;
function ok(name, cond, extra = "") {
  if (cond) {
    pass += 1;
    console.log(`  \u2705 ${name}${extra ? " \u2014 " + extra : ""}`);
  } else {
    fail += 1;
    console.log(`  \u274C ${name}${extra ? " \u2014 " + extra : ""}`);
  }
}
async function main() {
  console.log("\n\u30101\u3011P2 \u4ECA\u65E5\u5DE1\u5E97");
  const today = await getTodayRoute("U_REP");
  ok("\u95E8\u5E97\u6570 5", today.routeStores.length === 5, `\u5B9E\u9645 ${today.routeStores.length}`);
  ok("\u5DF2\u5B8C\u6210 2", today.summary.done === 2, `\u5B9E\u9645 ${today.summary.done}`);
  ok("\u5E73\u5747\u5065\u5EB7\u5206 85.5", today.summary.avgScore === 85.5, `\u5B9E\u9645 ${today.summary.avgScore}`);
  ok("\u5F85\u529E 1 \u6761\uFF08S5 \u6765\u81EA\u738B\u654F\uFF09", today.todoTasks.length === 1 && today.todoTasks[0].creatorName === "\u738B\u654F");
  const s2 = today.routeStores.find((r) => r.store.id === "S2");
  ok("S2 \u5C55\u793A 48 \u2192 80 (+32)", !!s2 && s2.store.prevScore === 48 && s2.store.lastScore === 80);
  console.log("\n\u30102\u3011P4 \u8BCA\u65AD\uFF08S3 \u4E3B\u7EBF\u5E97\uFF09");
  const res = await createDiagnosis({ storeId: "S3", photoIds: ["P_S3_COLD"], shootTypes: ["cold"] });
  const d = res.diagnosis;
  ok("\u5065\u5EB7\u5206 72", d.health.score === 72, `\u5B9E\u9645 ${d.health.score}`);
  ok("\u5206\u6863 \u826F\u597D", d.health.level === "good", d.health.level);
  ok("\u5206\u6863\u8272 #8BC34A", d.health.color === "#8BC34A", d.health.color);
  ok("\u9884\u671F\u5206 89\uFF08+17\uFF09", d.health.expectedScore === 89 && d.health.expectedScore - d.health.score === 17);
  ok("6 \u7EF4\u5EA6", d.dimensions.length === 6, d.dimensions.map((x) => `${x.name}${x.score}`).join(" "));
  ok(
    "\u7EF4\u5EA6\u5206 76/68/70/62/82/85",
    d.dimensions.map((x) => x.score).join(",") === "76,68,70,62,82,85",
    d.dimensions.map((x) => x.score).join(",")
  );
  ok("\u6807\u6CE8\u6846 14 \u4E2A", d.annotations.length === 14, `\u5B9E\u9645 ${d.annotations.length}`);
  ok(
    "\u6807\u6CE8\u5750\u6807\u5168\u4E3A 0\u2013100 \u767E\u5206\u6BD4",
    d.annotations.every((a) => a.x >= 0 && a.x <= 100 && a.y >= 0 && a.w > 0 && a.h > 0)
  );
  ok("\u8BC6\u522B\u6458\u8981 14 \u9879", d.summary.total === 14 && d.summary.text.includes("\u8499\u725BSKU 8 \u9879"));
  ok("\u95EE\u9898 4 \u6761\uFF082 \u4E25\u91CD + 2 \u4E2D\u5EA6\uFF09", d.issues.length === 4 && d.issues.filter((i) => i.severity === "severe").length === 2);
  ok("\u95EE\u9898\u6309\u4E25\u91CD\u5EA6\u6392\u5E8F", d.issues[0].severity === "severe" && d.issues[3].severity === "medium");
  ok("\u98CE\u9669 \u672C\u5468 27 \u74F6 / \xA5108", d.risk.weeklyBottles === 27 && d.risk.weeklyAmount === 108);
  ok("\u98CE\u9669 \u6708\u5EA6 117 \u74F6 / \xA5468", d.risk.monthlyBottles === 117 && d.risk.monthlyAmount === 468);
  ok("\u63A8\u5BFC\u4F9D\u636E\u542B\u7B97\u5F0F", d.risk.derivation.includes("37.5%") && d.risk.derivation.includes("3.9"));
  ok("\u884C\u52A8\u65B9\u6848 36 \u74F6 / \xA5144 / 3 \u5929", d.plan.totalBottles === 36 && d.plan.totalAmount === 144 && d.plan.coverDays === 3);
  ok("\u65B9\u6848\u542B 3 \u9879\u8865\u8D27 + 2 \u9879\u9648\u5217", d.plan.restock.length === 3 && d.plan.placement.length === 2);
  ok("\u5206\u6B65\u52A0\u8F7D 5 \u6B65", d.steps.length === 5);
  ok("GET /diagnoses/:id \u53EF\u56DE\u8BFB", (await getDiagnosis(d.id)).diagnosis.health.score === 72);
  console.log("\n\u30103\u3011S2 \u6574\u6539\u524D\uFF0848 \u5206\u6743\u5A01\u503C\u515C\u5E95\uFF09");
  const before = (await getDiagnosis("D_S2_BEFORE")).diagnosis;
  ok("S2 \u6574\u6539\u524D\u5C55\u793A 48 \u5206\uFF08\u975E\u516C\u5F0F 45.5\uFF09", before.health.score === 48, `\u5B9E\u9645 ${before.health.score}`);
  const after = (await getDiagnosis("D_S2")).diagnosis;
  ok("S2 \u6574\u6539\u540E 80 \u5206 \xB7 \u73AF\u6BD4 +32", after.health.score === 80 && after.health.delta === 32);
  console.log("\n\u30104\u3011AI \u591A\u8F6E\u8FFD\u95EE");
  const chips = await getChatSuggestions(d.id);
  ok("\u5FEB\u6377\u95EE\u9898 6 \u4E2A", chips.suggestions.length === 6);
  for (const q of chips.suggestions) {
    const r = await postChat({ diagnosisId: d.id, message: q, history: [] });
    ok(`\u547D\u4E2D\u300C${q}\u300D`, !!r.answerId && r.reply.length > 30, `answerId=${r.answerId}`);
  }
  const q2 = await postChat({ diagnosisId: d.id, message: "\u8BE5\u8865\u591A\u5C11", history: [] });
  ok("Q2 \u5F15\u7528 36 \u74F6 \xA5144", q2.reply.includes("36 \u74F6") && q2.reply.includes("\xA5144"));
  ok("Q2 \u8054\u52A8\u9AD8\u4EAE\u884C\u52A8\u65B9\u6848", q2.highlightSection === "plan");
  const q1 = await postChat({ diagnosisId: d.id, message: "\u4E3A\u4EC0\u4E48\u8FD9\u4E2A\u4F4D\u7F6E\u4E0D\u597D", history: [] });
  ok("Q1 \u5F15\u7528 1.2\u20131.6m \u9EC4\u91D1\u5C42", q1.reply.includes("1.2\u20131.6m"));
  const miss = await postChat({ diagnosisId: d.id, message: "\u4ECA\u5929\u5929\u6C14\u600E\u4E48\u6837\u554A", history: [] });
  ok("\u4E71\u8F93\u5165\u8D70\u515C\u5E95\u5E76\u7ED9 3 \u4E2A\u63A8\u8350", !miss.answerId && (miss.suggestions?.length ?? 0) === 3);
  const empty = await postChat({ diagnosisId: d.id, message: "", history: [] });
  ok("\u7A7A\u8F93\u5165\u8D70\u515C\u5E95", !empty.answerId && empty.reply.includes("\u53EF\u4EE5\u8BD5\u8BD5\u95EE\u6211"));
  console.log("\n\u30105\u3011\u964C\u751F\u7167\u7247\u515C\u5E95\uFF08\u4E0D\u767D\u5C4F\u4E0D\u62A5\u9519\uFF09");
  const fb = await createDiagnosis({ storeId: "S3", photoIds: [], shootTypes: ["cold"], unknownPhoto: true });
  const f = fb.diagnosis;
  ok("\u5206\u6570 0\u2013100 \u5408\u6CD5", f.health.score >= 0 && f.health.score <= 100, `\u5B9E\u9645 ${f.health.score}`);
  ok("\u4ECD\u6709\u6807\u6CE8\u6846\u4E0E\u95EE\u9898", f.annotations.length > 0 && f.issues.length > 0);
  ok("\u6765\u6E90\u6807\u8BB0\u4E3A computed", f.health.source === "computed");
  console.log("\n\u30106\u3011\u5355\u636E / \u4EFB\u52A1 / \u770B\u677F");
  const tk = await createTicket2({
    kind: "rectification",
    storeId: "S3",
    items: d.plan.restock,
    placements: d.plan.placement,
    totalBottles: d.plan.totalBottles,
    totalAmount: d.plan.totalAmount,
    note: "\u6D4B\u8BD5"
  });
  ok(
    "\u751F\u6210\u6574\u6539\u5355\uFF08\u5408\u8BA1\u6CBF\u7528\u6743\u5A01\u503C 36 \u74F6 \xA5144\uFF09",
    tk.ticket.id.startsWith("RC") && tk.ticket.totalBottles === 36 && tk.ticket.totalAmount === 144,
    `${tk.ticket.totalBottles} \u74F6 \xA5${tk.ticket.totalAmount}`
  );
  const task = await createTask2({
    storeId: "S5",
    taskType: "OOS",
    dueAt: "\u4ECA\u65E5 18:00",
    note: "\u6D4B\u8BD5\u4E0B\u6D3E",
    assigneeId: "U_REP"
  });
  const tasks = await getTasks("U_REP");
  ok("\u7ECF\u7406\u4E0B\u6D3E \u2192 \u4E1A\u4EE3\u5F85\u529E\u53EF\u89C1", tasks.tasks.some((t) => t.id === task.task.id), `\u5171 ${tasks.tasks.length} \u6761`);
  const ov = await getDashboardOverview("R_EAST");
  ok("\u770B\u677F KPI 4 \u5F20", ov.overview.kpis.length === 4);
  ok("\u770B\u677F\u5065\u5EB7\u5206 74.3", ov.overview.kpis[0].value === "74.3");
  ok("\u770B\u677F\u5206\u6863 42/53/21/12", ov.overview.distribution.map((b) => b.count).join(",") === "42,53,21,12");
  ok("\u770B\u677F\u8D8B\u52BF 3 \u6307\u6807 \xD7 8 \u5468", ov.overview.trend.length === 3 && ov.overview.trend[0].points.length === 8);
  const vs = await getVisits({ limit: 20 });
  ok("\u5DE1\u5E97\u8BB0\u5F55\u53EF\u67E5", vs.visits.length >= 6, `\u5B9E\u9645 ${vs.visits.length}`);
  console.log(`
\u2550\u2550\u2550\u2550\u2550\u2550 \u7ED3\u679C\uFF1A\u901A\u8FC7 ${pass} / \u5931\u8D25 ${fail} \u2550\u2550\u2550\u2550\u2550\u2550
`);
  if (fail > 0) process.exit(1);
}
main().catch((e) => {
  console.error("\u5192\u70DF\u6D4B\u8BD5\u5F02\u5E38\uFF1A", e);
  process.exit(1);
});
