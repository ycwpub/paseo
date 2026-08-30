import { ar as arBase } from "./ar";
import { chineseTranslationOverrides } from "./chinese-translation-overrides";
import { completeTranslationResource, mergeTranslationResources } from "./complete-resource";
import { en as enBase } from "./en";
import { englishTranslationOverrides } from "./english-translation-overrides";
import { es as esBase } from "./es";
import { featureTranslationAdditions } from "./feature-additions";
import { fr as frBase } from "./fr";
import { ja as jaBase } from "./ja";
import { ko as koBase } from "./ko";
import { localeTranslationOverrides } from "./locale-translation-overrides";
import { ptBR as ptBRBase } from "./pt-BR";
import { ru as ruBase } from "./ru";
import { zhCN as zhCNBase } from "./zh-CN";

export const en = mergeTranslationResources(
  mergeTranslationResources(enBase, featureTranslationAdditions.en),
  englishTranslationOverrides,
);

export const ar = completeTranslationResource(
  en,
  mergeTranslationResources(
    mergeTranslationResources(arBase, featureTranslationAdditions.ar),
    localeTranslationOverrides.ar,
  ),
);
export const es = completeTranslationResource(
  en,
  mergeTranslationResources(
    mergeTranslationResources(esBase, featureTranslationAdditions.es),
    localeTranslationOverrides.es,
  ),
);
export const fr = completeTranslationResource(
  en,
  mergeTranslationResources(
    mergeTranslationResources(frBase, featureTranslationAdditions.fr),
    localeTranslationOverrides.fr,
  ),
);
export const ja = completeTranslationResource(
  en,
  mergeTranslationResources(
    mergeTranslationResources(jaBase, featureTranslationAdditions.ja),
    localeTranslationOverrides.ja,
  ),
);
export const ko = completeTranslationResource(
  en,
  mergeTranslationResources(
    mergeTranslationResources(koBase, featureTranslationAdditions.ko),
    localeTranslationOverrides.ko,
  ),
);
export const ptBR = completeTranslationResource(
  en,
  mergeTranslationResources(
    mergeTranslationResources(ptBRBase, featureTranslationAdditions["pt-BR"]),
    localeTranslationOverrides["pt-BR"],
  ),
);
export const ru = completeTranslationResource(
  en,
  mergeTranslationResources(
    mergeTranslationResources(ruBase, featureTranslationAdditions.ru),
    localeTranslationOverrides.ru,
  ),
);
export const zhCN = completeTranslationResource(
  en,
  mergeTranslationResources(
    mergeTranslationResources(zhCNBase, featureTranslationAdditions["zh-CN"]),
    chineseTranslationOverrides,
  ),
);
