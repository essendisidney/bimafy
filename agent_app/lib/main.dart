import 'package:flutter/material.dart';
import 'package:provider/provider.dart';

import 'data/offline_store.dart';
import 'screens/shell.dart';
import 'theme/tamin_theme.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  final store = OfflineStore();
  await store.init();
  runApp(TaminAgentApp(store: store));
}

class TaminAgentApp extends StatelessWidget {
  const TaminAgentApp({super.key, required this.store});

  final OfflineStore store;

  @override
  Widget build(BuildContext context) {
    return ChangeNotifierProvider.value(
      value: store,
      child: MaterialApp(
        title: 'Bimafy Agent',
        debugShowCheckedModeBanner: false,
        theme: buildTaminTheme(),
        home: store.ready ? const AgentShell() : const _Boot(),
      ),
    );
  }
}

class _Boot extends StatelessWidget {
  const _Boot();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
