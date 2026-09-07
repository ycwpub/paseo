// Locale-specific translations moved out of upstream-owned resource files.
// Keep this file limited to keys whose feature-branch translation differs from the
// completed base locale plus featureTranslationAdditions.
export const localeTranslationOverrides = {
  ar: {
    message: {
      compaction: {
        loadingAuto: "يتم ضغط السياق تلقائيًا...",
        loadingManual: "يتم ضغط السياق يدويًا...",
      },
    },
    memoryPolicies: {
      globalDisabledTitle: "الذاكرة العامة متوقفة",
      globalDisabledDescription:
        "سيتم حفظ السياسة، لكن Paseo لن يستخدمها حتى يتم تفعيل الذاكرة في إعدادات المضيف.",
      scopeManager: {
        title: "قواعد الذاكرة",
        description: "إدارة المعلومات الدائمة التي يمكن لكل نطاق ذاكرة حفظها.",
        scopeType: "نطاق الذاكرة",
        target: "الهدف",
        selectTarget: "اختر هدفًا",
        instructionsTitle: "ما الذي يجب حفظه",
        save: "حفظ القواعد",
        saved: "تم الحفظ",
      },
      contentManager: {
        pageTitle: "إدارة الذاكرة",
        detailTitle: "تفاصيل الذاكرة",
        manage: "إدارة محتوى الذاكرة",
        manageDescription: "توجد {{count}} ذكريات. افتح الصفحة المخصصة لعرضها أو تعديلها أو حذفها.",
        openManager: "فتح",
        backToList: "العودة إلى قائمة الذاكرة",
        loading: "جارٍ تحميل الذاكرة…",
        notFound: "هذه الذاكرة غير موجودة أو تم حذفها.",
        errorTitle: "تعذرت إدارة الذاكرة",
        scopeEditHint: "يؤدي تغيير النطاق إلى نقل هذه الذاكرة إلى النطاق المحدد.",
        pagination: {
          pageSize: "العناصر في الصفحة",
          noPageSizes: "لا توجد أحجام صفحات متاحة",
          page: "الصفحة {{page}} من {{totalPages}}",
          range: "عرض {{start}}–{{end}} من {{total}}",
          previous: "السابق",
          next: "التالي",
        },
      },
    },
    workflows: {
      graph: {
        fullView: "الخطة الكاملة",
        fullViewTitle: "مخطط سير العمل الكامل",
        fullViewHint: "افحص مخطط التبعيات ومسار التنفيذ بالكامل، وكبّره أو افتح عقدة.",
        zoomIn: "تكبير مخطط سير العمل",
        zoomOut: "تصغير مخطط سير العمل",
        resetZoom: "إعادة ضبط تكبير مخطط سير العمل",
        nodeName: "اسم العقدة",
        nodeId: "معرّف العقدة",
        nodeType: "نوع العقدة",
        configuration: "إعدادات العقدة الكاملة",
      },
      nodes: {
        openDetails: "فتح تفاصيل العقدة {{name}}",
        downstream: {
          label: "العقدة التالية",
          hint: "اختر العقدة الشقيقة التي ستعمل بعد اكتمال هذه العقدة.",
          sequential: "اتباع ترتيب القائمة",
          sequentialDescription: "تشغيل العقدة التالية في القائمة.",
          end: "إنهاء التسلسل",
          endDescription: "إنهاء هذا التسلسل بعد اكتمال العقدة الحالية.",
          missing: "العقدة مفقودة: {{id}}",
          placeholder: "اختر العقدة التالية",
          empty: "لا توجد عقد تالية متاحة",
        },
        contract: {
          title: "عقد بيانات العقدة",
          description: "اربط الحقول المطلوبة فقط وتحقق من المدخلات والمخرجات.",
          inputs: "ربط المدخلات (JSON)",
          inputsHint: "يحافظ التعبير الكامل مثل {{nodes.scan.outputs.items}} على النوع الأصلي.",
          inputSchema: "مخطط الإدخال",
          outputSchema: "مخطط الإخراج",
          schemaHint: "اختياري. يتحقق Paseo قبل المتابعة.",
          invalidJson: "أدخل JSON صالحًا.",
          objectRequired: "يجب أن تكون القيمة كائن JSON.",
        },
        common: {
          environment: "متغيرات بيئة العقدة (JSON)",
          environmentHint: "تتجاوز القيم النصية الاختيارية بيئة أوامر Workflow لهذه العقدة.",
          environmentStringValues: "يجب أن تكون قيم متغيرات البيئة نصوصًا.",
        },
        python: {
          module: "وحدة Python",
          moduleHint: "مسار وحدة اختياري؛ اضبطه مع دالة.",
          function: "دالة Python",
          functionHint: "تستقبل إدخال العقدة الكامل وتعيد النتيجة؛ الدوال غير المتزامنة مدعومة.",
        },
        agent: {
          lifecycle: "دورة حياة الوكيل",
          lifecycleHint:
            "تحدد مدة إعادة استخدام عقدة الوكيل للوكيل نفسه. تُنفذ استدعاءات الوكيل المعاد استخدامه بالتتابع.",
          selectLifecycle: "اختر دورة حياة الوكيل",
          lifecycleOptions: {
            workflow: "سير العمل بالكامل",
            workflowDescription: "يُنشأ عند أول تنفيذ، ثم يُعاد استخدامه ويُحرر عند انتهاء سير العمل.",
            for: "حلقة For الحالية",
            forDescription:
              "يُنشأ عند أول تكرار، ويُعاد استخدامه داخل حلقة For الحالية، ثم يُحرر عند الخروج منها.",
            single: "تنفيذ واحد",
            singleDescription: "إنشاء وكيل جديد لكل تنفيذ دون إعادة استخدام.",
          },
          subsequentPromptMode: "مطالبة ما بعد الاستدعاء الأول",
          subsequentPromptModeHint: "اختر ما سيتم إرساله عند استدعاء وكيل تمت تهيئته مسبقًا.",
          selectSubsequentPromptMode: "اختر سلوك المطالبة اللاحقة",
          subsequentPromptModes: {
            reuseInitial: "إعادة استخدام المطالبة الأولية",
            reuseInitialDescription: "إعادة عرض المطالبة الأولية باستخدام مدخلات العقدة الحالية.",
            custom: "مطالبة مخصصة",
            customDescription: "استخدام مطالبة مستقلة لكل استدعاء بعد الأول.",
          },
          subsequentPrompt: "المطالبة اللاحقة المخصصة",
          subsequentPromptHint: "تدعم نفس بيانات الإدخال ومتغيرات القالب الخاصة بالمطالبة الأولية.",
          archiveAtLifecycleEnd: "أرشفة الوكيل تلقائيًا عند انتهاء دورة حياته",
        },
        for: {
          breakWhen: "شرط الإنهاء",
          breakWhenHint: "يجب أن يعيد التعبير قيمة منطقية؛ true تنهي الحلقة.",
          continueWhen: "شرط المتابعة",
          continueWhenHint: "يجب أن يعيد التعبير قيمة منطقية؛ true تتخطى بقية عقد التكرار الحالي.",
        },
      },
    },
    communityLinks: {
      star: "إضافة نجمة",
      sponsor: "رعاية",
      community: "المجتمع",
    },
  },
  es: {
    composer: {
      placeholders: {
        terminal: "Indicación",
      },
      input: {
        terminalAccessibilityLabel: "Entrada del terminal",
      },
    },
    message: {
      compaction: {
        loadingAuto: "Compactando el contexto automáticamente...",
        loadingManual: "Compactando el contexto manualmente...",
      },
    },
    memoryPolicies: {
      globalDisabledTitle: "La memoria global está desactivada",
      globalDisabledDescription:
        "La política se guardará, pero Paseo no la usará hasta que actives Memoria en la configuración del host.",
      scopeManager: {
        title: "Reglas de memoria",
        description: "Gestiona la información duradera que puede guardar cada ámbito de memoria.",
        scopeType: "Ámbito de memoria",
        target: "Destino",
        selectTarget: "Selecciona un destino",
        instructionsTitle: "Qué se debe guardar",
        save: "Guardar reglas",
        saved: "Guardado",
      },
      contentManager: {
        pageTitle: "Gestión de memoria",
        detailTitle: "Detalles de memoria",
        manage: "Gestionar contenido de memoria",
        manageDescription:
          "Hay {{count}} recuerdos. Abre la página dedicada para verlos, editarlos o eliminarlos.",
        openManager: "Abrir",
        backToList: "Volver a la lista de memoria",
        loading: "Cargando memoria…",
        notFound: "Este recuerdo no existe o se ha eliminado.",
        errorTitle: "No se puede gestionar la memoria",
        scopeEditHint: "Cambiar el ámbito mueve este recuerdo al ámbito seleccionado.",
        pagination: {
          pageSize: "Elementos por página",
          noPageSizes: "No hay tamaños de página disponibles",
          page: "Página {{page}} de {{totalPages}}",
          range: "Mostrando {{start}}–{{end}} de {{total}}",
          previous: "Anterior",
          next: "Siguiente",
        },
      },
    },
    workflows: {
      graph: {
        fullView: "Plan completo",
        fullViewTitle: "Grafo completo del flujo de trabajo",
        fullViewHint:
          "Inspecciona el grafo de dependencias y la ruta de ejecución, amplíalo o abre un nodo.",
        zoomIn: "Ampliar el grafo del flujo de trabajo",
        zoomOut: "Reducir el grafo del flujo de trabajo",
        resetZoom: "Restablecer el zoom del grafo",
        nodeName: "Nombre del nodo",
        nodeId: "ID del nodo",
        nodeType: "Tipo de nodo",
        configuration: "Configuración completa del nodo",
      },
      nodes: {
        openDetails: "Abrir los detalles del nodo {{name}}",
        downstream: {
          label: "Nodo siguiente",
          hint: "Elige el nodo del mismo nivel que se ejecutará al terminar este nodo.",
          sequential: "Seguir el orden de la lista",
          sequentialDescription: "Ejecutar el siguiente nodo de la lista.",
          end: "Finalizar la secuencia",
          endDescription: "Finalizar esta secuencia al completar el nodo actual.",
          missing: "Falta el nodo: {{id}}",
          placeholder: "Seleccionar nodo siguiente",
          empty: "No hay nodos siguientes disponibles",
        },
        contract: {
          title: "Contrato de datos del nodo",
          description:
            "Mapea solo los campos necesarios y valida entrada y salida con JSON Schema.",
          inputs: "Mapeo de entrada (JSON)",
          inputsHint:
            "Las expresiones completas como {{nodes.scan.outputs.items}} conservan el tipo original.",
          inputSchema: "Esquema de entrada",
          outputSchema: "Esquema de salida",
          schemaHint: "Opcional. Paseo valida el objeto antes de continuar.",
          invalidJson: "Introduce JSON válido.",
          objectRequired: "El valor debe ser un objeto JSON.",
        },
        common: {
          environment: "Variables de entorno del nodo (JSON)",
          environmentHint:
            "Los valores de texto opcionales reemplazan el entorno de comandos del Workflow para este nodo.",
          environmentStringValues: "Los valores de las variables de entorno deben ser texto.",
        },
        python: {
          module: "Módulo de Python",
          moduleHint: "Ruta de módulo opcional; configúrala junto con una función.",
          function: "Función de Python",
          functionHint:
            "Recibe la entrada completa del nodo y devuelve el resultado; admite funciones asíncronas.",
        },
        agent: {
          lifecycle: "Ciclo de vida del agente",
          lifecycleHint:
            "Controla cuánto tiempo este nodo reutiliza el mismo agente. Las llamadas reutilizadas se ejecutan en orden.",
          selectLifecycle: "Seleccionar ciclo de vida del agente",
          lifecycleOptions: {
            workflow: "Workflow completo",
            workflowDescription:
              "Se crea en la primera ejecución, se reutiliza y se libera cuando termina el Workflow.",
            for: "Bucle For actual",
            forDescription:
              "Se crea en la primera iteración, se reutiliza dentro del bucle For actual y se libera al salir.",
            single: "Ejecución única",
            singleDescription: "Crear un agente nuevo para cada ejecución, sin reutilizarlo.",
          },
          subsequentPromptMode: "Prompt posterior al primero",
          subsequentPromptModeHint:
            "Elige qué enviar cuando este nodo invoque un agente ya inicializado.",
          selectSubsequentPromptMode: "Seleccionar comportamiento del prompt posterior",
          subsequentPromptModes: {
            reuseInitial: "Reutilizar prompt inicial",
            reuseInitialDescription:
              "Volver a renderizar el prompt inicial con la entrada actual del nodo.",
            custom: "Prompt personalizado",
            customDescription:
              "Usar un prompt independiente en cada invocación posterior a la primera.",
          },
          subsequentPrompt: "Prompt posterior personalizado",
          subsequentPromptHint:
            "Admite los mismos datos de entrada y variables de plantilla que el prompt inicial.",
          archiveAtLifecycleEnd:
            "Archivar automáticamente al finalizar el ciclo de vida del agente",
        },
        for: {
          breakWhen: "Condición de finalización",
          breakWhenHint: "La expresión debe devolver un booleano; true termina el bucle.",
          continueWhen: "Condición de continuación",
          continueWhenHint:
            "La expresión debe devolver un booleano; true omite los nodos restantes de esta iteración.",
        },
      },
    },
    communityLinks: {
      star: "Dar estrella",
      sponsor: "Patrocinar",
      community: "Comunidad",
    },
  },
  fr: {
    shell: {
      commandCenter: {
        modeGroupLabel: "Mode d’affichage",
      },
    },
    composer: {
      placeholders: {
        fallback: "Écrivez un message...",
        terminal: "Invite",
      },
      input: {
        terminalAccessibilityLabel: "Invite du terminal",
      },
    },
    message: {
      compaction: {
        loadingAuto: "Compactage automatique du contexte...",
        loadingManual: "Compactage manuel du contexte...",
      },
    },
    memoryPolicies: {
      globalDisabledTitle: "La mémoire globale est désactivée",
      globalDisabledDescription:
        "Cette règle est enregistrée, mais Paseo ne l'utilisera qu'après activation de la mémoire dans les réglages de l'hôte.",
      scopeManager: {
        title: "Règles de mémoire",
        description:
          "Gérez les informations durables que chaque portée de mémoire peut enregistrer.",
        scopeType: "Portée de la mémoire",
        target: "Cible",
        selectTarget: "Sélectionner une cible",
        instructionsTitle: "Informations à enregistrer",
        save: "Enregistrer les règles",
        saved: "Enregistré",
      },
      contentManager: {
        pageTitle: "Gestion de la mémoire",
        detailTitle: "Détails de la mémoire",
        manage: "Gérer le contenu de la mémoire",
        manageDescription:
          "{{count}} souvenirs sont disponibles. Ouvrez la page dédiée pour les consulter, les modifier ou les supprimer.",
        openManager: "Ouvrir",
        backToList: "Retour à la liste des souvenirs",
        loading: "Chargement de la mémoire…",
        notFound: "Ce souvenir n’existe pas ou a été supprimé.",
        errorTitle: "Impossible de gérer la mémoire",
        scopeEditHint: "Changer la portée déplace ce souvenir vers la portée sélectionnée.",
        pagination: {
          pageSize: "Éléments par page",
          noPageSizes: "Aucune taille de page disponible",
          page: "Page {{page}} sur {{totalPages}}",
          range: "Affichage de {{start}} à {{end}} sur {{total}}",
          previous: "Précédent",
          next: "Suivant",
        },
      },
    },
    workflows: {
      graph: {
        fullView: "Plan complet",
        fullViewTitle: "Graphe complet du workflow",
        fullViewHint:
          "Inspectez le graphe des dépendances et le chemin d’exécution, zoomez ou ouvrez un nœud.",
        zoomIn: "Agrandir le graphe du workflow",
        zoomOut: "Réduire le graphe du workflow",
        resetZoom: "Réinitialiser le zoom du graphe",
        nodeName: "Nom du nœud",
        nodeId: "ID du nœud",
        nodeType: "Type de nœud",
        configuration: "Configuration complète du nœud",
      },
      nodes: {
        openDetails: "Ouvrir les détails du nœud {{name}}",
        downstream: {
          label: "Nœud suivant",
          hint: "Choisissez le nœud de même niveau à exécuter après celui-ci.",
          sequential: "Suivre l’ordre de la liste",
          sequentialDescription: "Exécuter le nœud suivant de la liste.",
          end: "Terminer la séquence",
          endDescription: "Terminer cette séquence après le nœud actuel.",
          missing: "Nœud manquant : {{id}}",
          placeholder: "Sélectionner le nœud suivant",
          empty: "Aucun nœud suivant disponible",
        },
        contract: {
          title: "Contrat de données du nœud",
          description: "Mappez uniquement les champs requis et validez les entrées et sorties.",
          inputs: "Mappage d’entrée (JSON)",
          inputsHint:
            "Une expression complète comme {{nodes.scan.outputs.items}} conserve son type natif.",
          inputSchema: "Schéma d’entrée",
          outputSchema: "Schéma de sortie",
          schemaHint: "Facultatif. Paseo valide l’objet avant de continuer.",
          invalidJson: "Saisissez un JSON valide.",
          objectRequired: "La valeur doit être un objet JSON.",
        },
        common: {
          environment: "Variables d’environnement du nœud (JSON)",
          environmentHint:
            "Les valeurs textuelles facultatives remplacent l’environnement de commande du Workflow pour ce nœud.",
          environmentStringValues:
            "Les valeurs des variables d’environnement doivent être des chaînes.",
        },
        python: {
          module: "Module Python",
          moduleHint: "Chemin de module facultatif à configurer avec une fonction.",
          function: "Fonction Python",
          functionHint:
            "Reçoit l’entrée complète du nœud et renvoie son résultat ; les fonctions asynchrones sont prises en charge.",
        },
        agent: {
          lifecycle: "Cycle de vie de l’agent",
          lifecycleHint:
            "Définit la durée de réutilisation du même agent par ce nœud. Les appels réutilisés sont exécutés dans l’ordre.",
          selectLifecycle: "Sélectionner le cycle de vie de l’agent",
          lifecycleOptions: {
            workflow: "Workflow entier",
            workflowDescription:
              "Créé lors de la première exécution, réutilisé, puis libéré à la fin du Workflow.",
            for: "Boucle For actuelle",
            forDescription:
              "Créé à la première itération, réutilisé dans la boucle For actuelle, puis libéré à sa sortie.",
            single: "Exécution unique",
            singleDescription: "Créer un nouvel agent à chaque exécution, sans réutilisation.",
          },
          subsequentPromptMode: "Prompt après le premier appel",
          subsequentPromptModeHint:
            "Choisissez le prompt envoyé lorsque ce nœud appelle un agent déjà initialisé.",
          selectSubsequentPromptMode: "Sélectionner le comportement du prompt suivant",
          subsequentPromptModes: {
            reuseInitial: "Réutiliser le prompt initial",
            reuseInitialDescription:
              "Rendre à nouveau le prompt initial avec les données actuelles du nœud.",
            custom: "Prompt personnalisé",
            customDescription: "Utiliser un prompt distinct pour chaque appel après le premier.",
          },
          subsequentPrompt: "Prompt suivant personnalisé",
          subsequentPromptHint:
            "Prend en charge les mêmes données et variables de modèle que le prompt initial.",
          archiveAtLifecycleEnd: "Archiver automatiquement à la fin du cycle de vie de l’agent",
        },
        for: {
          breakWhen: "Condition d’arrêt",
          breakWhenHint: "L’expression doit renvoyer un booléen ; true arrête la boucle.",
          continueWhen: "Condition de poursuite",
          continueWhenHint:
            "L’expression doit renvoyer un booléen ; true ignore les nœuds restants de cette itération.",
        },
      },
    },
    communityLinks: {
      star: "Ajouter une étoile",
      sponsor: "Soutenir",
      community: "Communauté",
    },
  },
  ja: {
    message: {
      compaction: {
        loadingAuto: "コンテキストを自動圧縮中...",
        loadingManual: "コンテキストを手動圧縮中...",
      },
    },
    memoryPolicies: {
      globalDisabledTitle: "グローバルメモリは無効です",
      globalDisabledDescription:
        "設定は保存されますが、ホスト設定でメモリを有効にするまで Paseo は使用しません。",
      scopeManager: {
        title: "メモリルール",
        description: "各メモリ範囲に保存する永続的な情報を管理します。",
        scopeType: "メモリ範囲",
        target: "対象",
        selectTarget: "対象を選択",
        instructionsTitle: "保存する情報",
        save: "ルールを保存",
        saved: "保存済み",
      },
      contentManager: {
        pageTitle: "メモリ管理",
        detailTitle: "メモリ詳細",
        manage: "メモリ内容を管理",
        manageDescription: "{{count}} 件のメモリがあります。専用ページで表示、編集、削除できます。",
        openManager: "開く",
        backToList: "メモリ一覧に戻る",
        loading: "メモリを読み込み中…",
        notFound: "このメモリは存在しないか、削除されています。",
        errorTitle: "メモリを管理できません",
        scopeEditHint: "範囲を変更すると、このメモリは選択した範囲へ移動します。",
        pagination: {
          pageSize: "1ページの件数",
          noPageSizes: "利用可能な件数設定がありません",
          page: "{{page}} / {{totalPages}} ページ",
          range: "{{total}} 件中 {{start}}～{{end}} 件を表示",
          previous: "前へ",
          next: "次へ",
        },
      },
    },
    workflows: {
      graph: {
        fullView: "全体プラン",
        fullViewTitle: "ワークフロー全体図",
        fullViewHint: "依存関係と実行経路の全体図を確認し、拡大縮小やノードの表示ができます。",
        zoomIn: "ワークフロー図を拡大",
        zoomOut: "ワークフロー図を縮小",
        resetZoom: "ワークフロー図の倍率をリセット",
        nodeName: "ノード名",
        nodeId: "ノードID",
        nodeType: "ノード種別",
        configuration: "ノードの完全な設定",
      },
      nodes: {
        openDetails: "{{name}}ノードの詳細を開く",
        downstream: {
          label: "次のノード",
          hint: "このノードの完了後に実行する同階層のノードを選択します。",
          sequential: "リスト順に実行",
          sequentialDescription: "リスト内の次のノードを実行します。",
          end: "シーケンスを終了",
          endDescription: "現在のノードの完了後にこのシーケンスを終了します。",
          missing: "ノードがありません：{{id}}",
          placeholder: "次のノードを選択",
          empty: "選択できる次のノードがありません",
        },
        contract: {
          title: "ノードデータ契約",
          description: "必要なフィールドだけをマッピングし、入出力を検証します。",
          inputs: "入力マッピング（JSON）",
          inputsHint: "{{nodes.scan.outputs.items}} のような式全体では元の型が保持されます。",
          inputSchema: "入力スキーマ",
          outputSchema: "出力スキーマ",
          schemaHint: "任意。続行前に Paseo が検証します。",
          invalidJson: "有効な JSON を入力してください。",
          objectRequired: "JSON オブジェクトが必要です。",
        },
        common: {
          environment: "ノード環境変数（JSON）",
          environmentHint: "任意の文字列値で、このノードの Workflow コマンド環境を上書きします。",
          environmentStringValues: "環境変数の値は文字列である必要があります。",
        },
        python: {
          module: "Python モジュール",
          moduleHint: "任意のモジュールパスです。関数と一緒に設定します。",
          function: "Python 関数",
          functionHint: "完全なノード入力を受け取り、結果を返します。非同期関数にも対応します。",
        },
        agent: {
          lifecycle: "エージェントのライフサイクル",
          lifecycleHint:
            "このエージェントノードが同じエージェントを再利用する期間を指定します。再利用時の呼び出しは順番に実行されます。",
          selectLifecycle: "エージェントのライフサイクルを選択",
          lifecycleOptions: {
            workflow: "Workflow 全体",
            workflowDescription: "初回実行時に作成して再利用し、Workflow の終了時に解放します。",
            for: "現在の For ループ",
            forDescription:
              "最初の反復で作成し、現在の For ループ内で再利用して、ループ終了時に解放します。",
            single: "単一実行",
            singleDescription: "実行ごとに新しいエージェントを作成し、再利用しません。",
          },
          subsequentPromptMode: "2 回目以降のプロンプト",
          subsequentPromptModeHint:
            "初期化済みのエージェントを再度呼び出すときに送信する内容を選択します。",
          selectSubsequentPromptMode: "2 回目以降のプロンプト動作を選択",
          subsequentPromptModes: {
            reuseInitial: "初期プロンプトを再利用",
            reuseInitialDescription: "現在のノード入力で初期プロンプトを再レンダリングします。",
            custom: "カスタムプロンプト",
            customDescription: "初回以降の呼び出しでは別のプロンプトを使用します。",
          },
          subsequentPrompt: "カスタムの後続プロンプト",
          subsequentPromptHint:
            "初期プロンプトと同じ入力データおよびテンプレート変数を利用できます。",
          archiveAtLifecycleEnd: "エージェントのライフサイクル終了時に自動アーカイブ",
        },
        for: {
          breakWhen: "終了条件",
          breakWhenHint: "式は真偽値を返す必要があり、true の場合はループを終了します。",
          continueWhen: "継続条件",
          continueWhenHint:
            "式は真偽値を返す必要があり、true の場合は現在の反復の残りのノードをスキップします。",
        },
      },
    },
    communityLinks: {
      star: "スター",
      sponsor: "スポンサー",
      community: "コミュニティ",
    },
    settings: {
      hostSections: {
        assistants: "アシスタント",
        memory: "メモリ",
        skills: "スキル",
        channels: "チャンネル",
      },
    },
  },
  ko: {
    message: {
      compaction: {
        loadingAuto: "컨텍스트를 자동으로 압축하는 중...",
        loadingManual: "컨텍스트를 수동으로 압축하는 중...",
      },
    },
    memoryPolicies: {
      globalDisabledTitle: "전역 메모리가 꺼져 있습니다",
      globalDisabledDescription:
        "정책은 저장되지만 호스트 설정에서 메모리를 켜기 전까지 Paseo가 사용하지 않습니다.",
      scopeManager: {
        title: "메모리 규칙",
        description: "각 메모리 범위에 저장할 영구 정보를 관리합니다.",
        scopeType: "메모리 범위",
        target: "대상",
        selectTarget: "대상 선택",
        instructionsTitle: "저장할 정보",
        save: "규칙 저장",
        saved: "저장됨",
      },
      contentManager: {
        pageTitle: "메모리 관리",
        detailTitle: "메모리 상세",
        manage: "메모리 내용 관리",
        manageDescription:
          "{{count}}개의 메모리가 있습니다. 전용 페이지에서 조회, 편집 또는 삭제할 수 있습니다.",
        openManager: "열기",
        backToList: "메모리 목록으로 돌아가기",
        loading: "메모리 불러오는 중…",
        notFound: "이 메모리는 없거나 삭제되었습니다.",
        errorTitle: "메모리를 관리할 수 없습니다",
        scopeEditHint: "범위를 변경하면 이 메모리가 선택한 범위로 이동합니다.",
        pagination: {
          pageSize: "페이지당 항목",
          noPageSizes: "사용 가능한 페이지 크기가 없습니다",
          page: "{{page}} / {{totalPages}} 페이지",
          range: "전체 {{total}}개 중 {{start}}–{{end}}개 표시",
          previous: "이전",
          next: "다음",
        },
      },
    },
    workflows: {
      graph: {
        fullView: "전체 계획",
        fullViewTitle: "전체 워크플로 그래프",
        fullViewHint: "전체 종속성 그래프와 실행 경로를 확인하고 확대하거나 노드를 열 수 있습니다.",
        zoomIn: "워크플로 그래프 확대",
        zoomOut: "워크플로 그래프 축소",
        resetZoom: "워크플로 그래프 확대/축소 초기화",
        nodeName: "노드 이름",
        nodeId: "노드 ID",
        nodeType: "노드 유형",
        configuration: "전체 노드 구성",
      },
      nodes: {
        openDetails: "{{name}} 노드 세부 정보 열기",
        downstream: {
          label: "다음 노드",
          hint: "이 노드가 완료된 후 실행할 같은 수준의 노드를 선택하세요.",
          sequential: "목록 순서 따르기",
          sequentialDescription: "목록의 다음 노드를 실행합니다.",
          end: "시퀀스 종료",
          endDescription: "현재 노드가 완료되면 이 시퀀스를 종료합니다.",
          missing: "노드 없음: {{id}}",
          placeholder: "다음 노드 선택",
          empty: "선택할 수 있는 다음 노드가 없습니다",
        },
        agent: {
          lifecycle: "에이전트 수명 주기",
          lifecycleHint:
            "이 에이전트 노드가 동일한 에이전트를 재사용하는 기간을 정합니다. 재사용되는 에이전트 호출은 순서대로 실행됩니다.",
          selectLifecycle: "에이전트 수명 주기 선택",
          lifecycleOptions: {
            workflow: "전체 Workflow",
            workflowDescription: "첫 실행 시 생성하여 재사용하고 Workflow가 끝나면 해제합니다.",
            for: "현재 For 루프",
            forDescription:
              "첫 반복에서 생성하여 현재 For 루프 안에서 재사용하고 루프를 벗어나면 해제합니다.",
            single: "단일 실행",
            singleDescription: "실행할 때마다 새 에이전트를 생성하며 재사용하지 않습니다.",
          },
          subsequentPromptMode: "첫 실행 이후 프롬프트",
          subsequentPromptModeHint:
            "이미 초기화된 에이전트를 다시 호출할 때 보낼 프롬프트를 선택합니다.",
          selectSubsequentPromptMode: "후속 프롬프트 방식 선택",
          subsequentPromptModes: {
            reuseInitial: "초기 프롬프트 재사용",
            reuseInitialDescription: "현재 노드 입력으로 초기 프롬프트를 다시 렌더링합니다.",
            custom: "사용자 지정 프롬프트",
            customDescription: "첫 호출 이후에는 별도로 설정한 프롬프트를 사용합니다.",
          },
          subsequentPrompt: "사용자 지정 후속 프롬프트",
          subsequentPromptHint: "초기 프롬프트와 동일한 입력 데이터 및 템플릿 변수를 지원합니다.",
          archiveAtLifecycleEnd: "에이전트 수명 주기가 끝나면 자동 보관",
        },
      },
    },
    communityLinks: {
      star: "스타",
      sponsor: "후원",
      community: "커뮤니티",
    },
  },
  "pt-BR": {
    message: {
      compaction: {
        loadingAuto: "Compactando o contexto automaticamente...",
        loadingManual: "Compactando o contexto manualmente...",
      },
    },
    memoryPolicies: {
      globalDisabledTitle: "A memória global está desativada",
      globalDisabledDescription:
        "A política será salva, mas o Paseo só a usará depois que a Memória for ativada nas configurações do host.",
      scopeManager: {
        title: "Regras de memória",
        description: "Gerencie as informações duráveis que cada escopo de memória pode salvar.",
        scopeType: "Escopo da memória",
        target: "Destino",
        selectTarget: "Selecione um destino",
        instructionsTitle: "O que deve ser salvo",
        save: "Salvar regras",
        saved: "Salvo",
      },
      contentManager: {
        pageTitle: "Gerenciamento de memória",
        detailTitle: "Detalhes da memória",
        manage: "Gerenciar conteúdo da memória",
        manageDescription:
          "Há {{count}} memórias. Abra a página dedicada para visualizar, editar ou excluir.",
        openManager: "Abrir",
        backToList: "Voltar à lista de memórias",
        loading: "Carregando memória…",
        notFound: "Esta memória não existe ou foi excluída.",
        errorTitle: "Não foi possível gerenciar a memória",
        scopeEditHint: "Alterar o escopo move esta memória para o escopo selecionado.",
        pagination: {
          pageSize: "Itens por página",
          noPageSizes: "Nenhum tamanho de página disponível",
          page: "Página {{page}} de {{totalPages}}",
          range: "Mostrando {{start}}–{{end}} de {{total}}",
          previous: "Anterior",
          next: "Próxima",
        },
      },
    },
    workflows: {
      graph: {
        fullView: "Plano completo",
        fullViewTitle: "Grafo completo do workflow",
        fullViewHint:
          "Inspecione o grafo de dependências e o caminho de execução, aplique zoom ou abra um nó.",
        zoomIn: "Ampliar o grafo do workflow",
        zoomOut: "Reduzir o grafo do workflow",
        resetZoom: "Redefinir o zoom do grafo",
        nodeName: "Nome do nó",
        nodeId: "ID do nó",
        nodeType: "Tipo do nó",
        configuration: "Configuração completa do nó",
      },
      nodes: {
        openDetails: "Abrir detalhes do nó {{name}}",
        downstream: {
          label: "Próximo nó",
          hint: "Escolha o nó do mesmo nível que será executado após este nó.",
          sequential: "Seguir a ordem da lista",
          sequentialDescription: "Executar o próximo nó da lista.",
          end: "Encerrar sequência",
          endDescription: "Encerrar esta sequência após a conclusão do nó atual.",
          missing: "Nó ausente: {{id}}",
          placeholder: "Selecionar próximo nó",
          empty: "Nenhum próximo nó disponível",
        },
        contract: {
          title: "Contrato de dados do nó",
          description: "Mapeie apenas os campos necessários e valide entrada e saída.",
          inputs: "Mapeamento de entrada (JSON)",
          inputsHint:
            "Expressões completas como {{nodes.scan.outputs.items}} preservam o tipo nativo.",
          inputSchema: "Esquema de entrada",
          outputSchema: "Esquema de saída",
          schemaHint: "Opcional. O Paseo valida antes de continuar.",
          invalidJson: "Digite um JSON válido.",
          objectRequired: "O valor deve ser um objeto JSON.",
        },
        common: {
          environment: "Variáveis de ambiente do nó (JSON)",
          environmentHint:
            "Valores de texto opcionais substituem o ambiente de comandos do Workflow neste nó.",
          environmentStringValues: "Os valores das variáveis de ambiente devem ser textos.",
        },
        python: {
          module: "Módulo Python",
          moduleHint: "Caminho de módulo opcional; configure-o junto com uma função.",
          function: "Função Python",
          functionHint:
            "Recebe toda a entrada do nó e retorna o resultado; aceita funções assíncronas.",
        },
        agent: {
          lifecycle: "Ciclo de vida do agente",
          lifecycleHint:
            "Controla por quanto tempo este nó reutiliza o mesmo agente. As chamadas reutilizadas são executadas em ordem.",
          selectLifecycle: "Selecionar ciclo de vida do agente",
          lifecycleOptions: {
            workflow: "Workflow inteiro",
            workflowDescription:
              "Cria na primeira execução, reutiliza e libera quando o Workflow termina.",
            for: "Loop For atual",
            forDescription:
              "Cria na primeira iteração, reutiliza no loop For atual e libera ao sair do loop.",
            single: "Execução única",
            singleDescription: "Criar um novo agente a cada execução, sem reutilização.",
          },
          subsequentPromptMode: "Prompt após a primeira chamada",
          subsequentPromptModeHint:
            "Escolha o que enviar quando este nó chamar um agente já inicializado.",
          selectSubsequentPromptMode: "Selecionar comportamento do prompt seguinte",
          subsequentPromptModes: {
            reuseInitial: "Reutilizar prompt inicial",
            reuseInitialDescription:
              "Renderizar novamente o prompt inicial com a entrada atual do nó.",
            custom: "Prompt personalizado",
            customDescription: "Usar um prompt separado em cada chamada após a primeira.",
          },
          subsequentPrompt: "Prompt seguinte personalizado",
          subsequentPromptHint:
            "Aceita os mesmos dados de entrada e variáveis de modelo do prompt inicial.",
          archiveAtLifecycleEnd: "Arquivar automaticamente ao fim do ciclo de vida do agente",
        },
        for: {
          breakWhen: "Condição de parada",
          breakWhenHint: "A expressão deve retornar um booleano; true encerra o loop.",
          continueWhen: "Condição de continuação",
          continueWhenHint:
            "A expressão deve retornar um booleano; true ignora os nós restantes desta iteração.",
        },
      },
    },
    communityLinks: {
      star: "Dar estrela",
      sponsor: "Patrocinar",
      community: "Comunidade",
    },
    settings: {
      hostSections: {
        assistants: "Assistentes",
        memory: "Memória",
        channels: "Canais",
      },
    },
  },
  ru: {
    message: {
      compaction: {
        loadingAuto: "Автоматическое сжатие контекста...",
        loadingManual: "Ручное сжатие контекста...",
      },
    },
    memoryPolicies: {
      globalDisabledTitle: "Глобальная память отключена",
      globalDisabledDescription:
        "Политика сохранится, но Paseo начнёт использовать её только после включения памяти в настройках хоста.",
      scopeManager: {
        title: "Правила памяти",
        description:
          "Управляйте долговременными сведениями, которые может сохранять каждая область памяти.",
        scopeType: "Область памяти",
        target: "Объект",
        selectTarget: "Выберите объект",
        instructionsTitle: "Что сохранять",
        save: "Сохранить правила",
        saved: "Сохранено",
      },
      contentManager: {
        pageTitle: "Управление памятью",
        detailTitle: "Сведения о памяти",
        manage: "Управлять содержимым памяти",
        manageDescription:
          "Доступно записей: {{count}}. Откройте отдельную страницу для просмотра, редактирования или удаления.",
        openManager: "Открыть",
        backToList: "Вернуться к списку памяти",
        loading: "Загрузка памяти…",
        notFound: "Эта запись памяти не существует или была удалена.",
        errorTitle: "Не удалось управлять памятью",
        scopeEditHint: "Изменение области перемещает запись памяти в выбранную область.",
        pagination: {
          pageSize: "Записей на странице",
          noPageSizes: "Нет доступных размеров страницы",
          page: "Страница {{page}} из {{totalPages}}",
          range: "Показано {{start}}–{{end}} из {{total}}",
          previous: "Назад",
          next: "Далее",
        },
      },
    },
    workflows: {
      graph: {
        fullView: "Полный план",
        fullViewTitle: "Полный граф рабочего процесса",
        fullViewHint:
          "Просматривайте граф зависимостей и путь выполнения, масштабируйте его или открывайте узлы.",
        zoomIn: "Увеличить граф рабочего процесса",
        zoomOut: "Уменьшить граф рабочего процесса",
        resetZoom: "Сбросить масштаб графа",
        nodeName: "Имя узла",
        nodeId: "ID узла",
        nodeType: "Тип узла",
        configuration: "Полная конфигурация узла",
      },
      nodes: {
        openDetails: "Открыть сведения об узле {{name}}",
        downstream: {
          label: "Следующий узел",
          hint: "Выберите узел того же уровня, который запустится после завершения текущего.",
          sequential: "Следовать порядку списка",
          sequentialDescription: "Запустить следующий узел в списке.",
          end: "Завершить последовательность",
          endDescription: "Завершить последовательность после текущего узла.",
          missing: "Узел отсутствует: {{id}}",
          placeholder: "Выберите следующий узел",
          empty: "Нет доступных следующих узлов",
        },
        contract: {
          title: "Контракт данных узла",
          description: "Передавайте только нужные поля и проверяйте вход и выход.",
          inputs: "Сопоставление входа (JSON)",
          inputsHint:
            "Полное выражение, например {{nodes.scan.outputs.items}}, сохраняет исходный тип.",
          inputSchema: "Схема входа",
          outputSchema: "Схема выхода",
          schemaHint: "Необязательно. Paseo проверит объект перед продолжением.",
          invalidJson: "Введите корректный JSON.",
          objectRequired: "Значение должно быть JSON-объектом.",
        },
        common: {
          environment: "Переменные окружения узла (JSON)",
          environmentHint:
            "Необязательные строки переопределяют окружение команд Workflow для этого узла.",
          environmentStringValues: "Значения переменных окружения должны быть строками.",
        },
        python: {
          module: "Модуль Python",
          moduleHint: "Необязательный путь модуля; задаётся вместе с функцией.",
          function: "Функция Python",
          functionHint:
            "Получает полный вход узла и возвращает результат; поддерживает асинхронные функции.",
        },
        agent: {
          lifecycle: "Жизненный цикл агента",
          lifecycleHint:
            "Определяет, как долго этот узел повторно использует одного агента. Повторные вызовы выполняются последовательно.",
          selectLifecycle: "Выберите жизненный цикл агента",
          lifecycleOptions: {
            workflow: "Весь Workflow",
            workflowDescription:
              "Создать при первом запуске, повторно использовать и освободить после завершения Workflow.",
            for: "Текущий цикл For",
            forDescription:
              "Создать на первой итерации, повторно использовать в текущем цикле For и освободить при выходе.",
            single: "Один запуск",
            singleDescription:
              "Создавать нового агента для каждого запуска без повторного использования.",
          },
          subsequentPromptMode: "Промпт после первого вызова",
          subsequentPromptModeHint:
            "Выберите, что отправлять при повторном вызове уже созданного агента.",
          selectSubsequentPromptMode: "Выберите режим последующего промпта",
          subsequentPromptModes: {
            reuseInitial: "Повторять начальный промпт",
            reuseInitialDescription:
              "Повторно формировать начальный промпт из текущих входных данных узла.",
            custom: "Свой промпт",
            customDescription: "Использовать отдельный промпт для каждого вызова после первого.",
          },
          subsequentPrompt: "Свой последующий промпт",
          subsequentPromptHint:
            "Поддерживает те же входные данные и переменные шаблона, что и начальный промпт.",
          archiveAtLifecycleEnd:
            "Автоматически архивировать после завершения жизненного цикла агента",
        },
        for: {
          breakWhen: "Условие остановки",
          breakWhenHint: "Выражение должно вернуть boolean; true завершает цикл.",
          continueWhen: "Условие продолжения",
          continueWhenHint:
            "Выражение должно вернуть boolean; true пропускает оставшиеся узлы текущей итерации.",
        },
      },
    },
    communityLinks: {
      star: "Добавить звезду",
      sponsor: "Поддержать",
      community: "Сообщество",
    },
    settings: {
      hostSections: {
        assistants: "Ассистенты",
        memory: "Память",
        skills: "Навыки",
        channels: "Каналы",
      },
    },
  },
} as const;
