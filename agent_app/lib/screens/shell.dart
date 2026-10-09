import 'package:flutter/material.dart';
import 'package:intl/intl.dart';
import 'package:provider/provider.dart';

import '../data/offline_store.dart';
import '../models/models.dart';
import '../theme/tamin_theme.dart';

final kes = NumberFormat.currency(locale: 'en_KE', symbol: 'KES ', decimalDigits: 0);

class AgentShell extends StatefulWidget {
  const AgentShell({super.key});

  @override
  State<AgentShell> createState() => _AgentShellState();
}

class _AgentShellState extends State<AgentShell> {
  int index = 0;

  @override
  Widget build(BuildContext context) {
    final store = context.watch<OfflineStore>();
    final pages = [
      const HomeScreen(),
      const LeadsScreen(),
      const QuoteScreen(),
      const CollectScreen(),
      const ClaimScreen(),
    ];

    return Scaffold(
      body: pages[index],
      bottomNavigationBar: NavigationBar(
        selectedIndex: index,
        onDestinationSelected: (i) => setState(() => index = i),
        destinations: [
          const NavigationDestination(icon: Icon(Icons.home_outlined), selectedIcon: Icon(Icons.home), label: 'Home'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: store.leads.where((l) => !l.synced).isNotEmpty,
              child: const Icon(Icons.people_outline),
            ),
            selectedIcon: const Icon(Icons.people),
            label: 'Leads',
          ),
          const NavigationDestination(icon: Icon(Icons.request_quote_outlined), selectedIcon: Icon(Icons.request_quote), label: 'Quote'),
          const NavigationDestination(icon: Icon(Icons.payments_outlined), selectedIcon: Icon(Icons.payments), label: 'Collect'),
          NavigationDestination(
            icon: Badge(
              isLabelVisible: store.pendingCount > 0,
              label: Text('${store.pendingCount}'),
              child: const Icon(Icons.sync_outlined),
            ),
            selectedIcon: const Icon(Icons.sync),
            label: 'Sync',
          ),
        ],
      ),
    );
  }
}

class SoftCard extends StatelessWidget {
  const SoftCard({super.key, required this.child, this.padding = const EdgeInsets.all(16)});

  final Widget child;
  final EdgeInsets padding;

  @override
  Widget build(BuildContext context) {
    return Card(child: Padding(padding: padding, child: child));
  }
}

class HomeScreen extends StatelessWidget {
  const HomeScreen({super.key});

  @override
  Widget build(BuildContext context) {
    final store = context.watch<OfflineStore>();
    final a = store.agent;
    final progress = (a.ytdGwp / a.target).clamp(0.0, 1.0);

    return CustomScrollView(
      slivers: [
        SliverAppBar(
          pinned: true,
          expandedHeight: 140,
          flexibleSpace: FlexibleSpaceBar(
            titlePadding: const EdgeInsets.only(left: 16, bottom: 14, right: 16),
            title: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Bimafy', style: TextStyle(color: TaminColors.champagne.withOpacity(0.8), fontSize: 12, letterSpacing: 2)),
                Text(a.name, style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
              ],
            ),
            background: Container(
              decoration: const BoxDecoration(
                gradient: LinearGradient(
                  begin: Alignment.topLeft,
                  end: Alignment.bottomRight,
                  colors: [TaminColors.navy, TaminColors.forest, Color(0xFF0A3D3A)],
                ),
              ),
            ),
          ),
          actions: [
            Padding(
              padding: const EdgeInsets.only(right: 8),
              child: FilterChip(
                label: Text(store.online ? 'Online' : 'Offline'),
                selected: store.online,
                onSelected: (v) => store.setOnline(v),
                selectedColor: TaminColors.mint.withOpacity(0.3),
                checkmarkColor: TaminColors.champagne,
                labelStyle: const TextStyle(color: TaminColors.champagne, fontSize: 12),
                side: const BorderSide(color: TaminColors.gold),
                backgroundColor: Colors.transparent,
              ),
            ),
          ],
        ),
        SliverPadding(
          padding: const EdgeInsets.all(16),
          sliver: SliverList.list(
            children: [
              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text('${a.branch} · ${a.code}', style: const TextStyle(color: TaminColors.mute, fontSize: 13)),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        Expanded(child: _Stat(label: 'YTD GWP', value: kes.format(a.ytdGwp))),
                        Expanded(child: _Stat(label: 'Target', value: kes.format(a.target))),
                      ],
                    ),
                    const SizedBox(height: 8),
                    Row(
                      children: [
                        Expanded(child: _Stat(label: 'Wallet', value: kes.format(a.wallet))),
                        Expanded(child: _Stat(label: 'Pending sync', value: '${store.pendingCount}')),
                      ],
                    ),
                    const SizedBox(height: 12),
                    ClipRRect(
                      borderRadius: BorderRadius.circular(99),
                      child: LinearProgressIndicator(
                        value: progress,
                        minHeight: 8,
                        backgroundColor: TaminColors.line,
                        color: TaminColors.teal,
                      ),
                    ),
                    const SizedBox(height: 6),
                    Text('${(progress * 100).round()}% of annual target', style: const TextStyle(fontSize: 12, color: TaminColors.mute)),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Field book', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    Text(
                      '${store.leads.length} leads · ${store.quotes.length} quotes · ${store.collections.length} collections · ${store.claims.length} claims',
                      style: const TextStyle(color: TaminColors.mute),
                    ),
                    const SizedBox(height: 12),
                    Text(
                      store.online
                          ? 'Connected. Changes sync automatically.'
                          : 'Offline mode. Enrolments queue until connectivity returns.',
                      style: TextStyle(
                        color: store.online ? TaminColors.teal : TaminColors.gold,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                    if (store.lastSyncMessage != null) ...[
                      const SizedBox(height: 6),
                      Text(store.lastSyncMessage!, style: const TextStyle(fontSize: 12, color: TaminColors.mute)),
                    ],
                    const SizedBox(height: 12),
                    FilledButton.icon(
                      onPressed: store.syncing ? null : () => store.syncNow(),
                      icon: store.syncing
                          ? const SizedBox(width: 16, height: 16, child: CircularProgressIndicator(strokeWidth: 2, color: Colors.white))
                          : const Icon(Icons.cloud_sync),
                      label: Text(store.syncing ? 'Syncing…' : 'Sync now'),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 12),
              SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    const Text('Quick products', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                    const SizedBox(height: 8),
                    ...store.products.map(
                      (p) => ListTile(
                        contentPadding: EdgeInsets.zero,
                        title: Text(p.name),
                        subtitle: Text('${p.code} · from ${kes.format(p.minContribution)}'),
                        trailing: p.isMicro
                            ? const Chip(label: Text('Micro'), visualDensity: VisualDensity.compact)
                            : null,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
            ],
          ),
        ),
      ],
    );
  }
}

class _Stat extends StatelessWidget {
  const _Stat({required this.label, required this.value});
  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(label, style: const TextStyle(fontSize: 12, color: TaminColors.mute)),
        const SizedBox(height: 2),
        Text(value, style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
      ],
    );
  }
}

class LeadsScreen extends StatefulWidget {
  const LeadsScreen({super.key});

  @override
  State<LeadsScreen> createState() => _LeadsScreenState();
}

class _LeadsScreenState extends State<LeadsScreen> {
  final nameCtrl = TextEditingController();
  final phoneCtrl = TextEditingController();
  final notesCtrl = TextEditingController();
  String line = 'micro';

  @override
  void dispose() {
    nameCtrl.dispose();
    phoneCtrl.dispose();
    notesCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<OfflineStore>();

    return Scaffold(
      appBar: AppBar(title: const Text('Leads')),
      floatingActionButton: FloatingActionButton.extended(
        onPressed: () => _showAdd(context, store),
        icon: const Icon(Icons.person_add_alt),
        label: const Text('Add lead'),
      ),
      body: ListView.separated(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 88),
        itemCount: store.leads.length,
        separatorBuilder: (_, __) => const SizedBox(height: 8),
        itemBuilder: (context, i) {
          final l = store.leads[i];
          return SoftCard(
            child: Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(l.name, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                      Text(l.phone, style: const TextStyle(color: TaminColors.mute)),
                      const SizedBox(height: 4),
                      Text('${l.productLine} · ${l.status.name}', style: const TextStyle(fontSize: 12)),
                      if (l.notes.isNotEmpty) Text(l.notes, style: const TextStyle(fontSize: 12, color: TaminColors.mute)),
                    ],
                  ),
                ),
                Icon(
                  l.synced ? Icons.cloud_done : Icons.cloud_off,
                  color: l.synced ? TaminColors.teal : TaminColors.gold,
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _showAdd(BuildContext context, OfflineStore store) async {
    nameCtrl.clear();
    phoneCtrl.clear();
    notesCtrl.clear();
    line = 'micro';

    await showModalBottomSheet<void>(
      context: context,
      isScrollControlled: true,
      builder: (ctx) {
        return Padding(
          padding: EdgeInsets.only(
            left: 16,
            right: 16,
            top: 16,
            bottom: MediaQuery.of(ctx).viewInsets.bottom + 16,
          ),
          child: StatefulBuilder(
            builder: (context, setModal) {
              return Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Text('New lead', style: TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
                  const SizedBox(height: 12),
                  TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Full name')),
                  const SizedBox(height: 8),
                  TextField(controller: phoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'MSISDN')),
                  const SizedBox(height: 8),
                  DropdownButtonFormField<String>(
                    value: line,
                    items: const [
                      DropdownMenuItem(value: 'micro', child: Text('Boda / micro')),
                      DropdownMenuItem(value: 'medical', child: Text('Medical')),
                      DropdownMenuItem(value: 'motor', child: Text('Motor')),
                      DropdownMenuItem(value: 'family_takaful', child: Text('Family')),
                    ],
                    onChanged: (v) => setModal(() => line = v ?? 'micro'),
                    decoration: const InputDecoration(labelText: 'Interest'),
                  ),
                  const SizedBox(height: 8),
                  TextField(controller: notesCtrl, decoration: const InputDecoration(labelText: 'Notes'), maxLines: 2),
                  const SizedBox(height: 12),
                  SizedBox(
                    width: double.infinity,
                    child: FilledButton(
                      onPressed: () async {
                        if (nameCtrl.text.trim().isEmpty || phoneCtrl.text.trim().isEmpty) return;
                        await store.addLead(
                          name: nameCtrl.text.trim(),
                          phone: phoneCtrl.text.trim(),
                          productLine: line,
                          notes: notesCtrl.text.trim(),
                        );
                        if (ctx.mounted) Navigator.pop(ctx);
                      },
                      child: const Text('Save offline'),
                    ),
                  ),
                ],
              );
            },
          ),
        );
      },
    );
  }
}

class QuoteScreen extends StatefulWidget {
  const QuoteScreen({super.key});

  @override
  State<QuoteScreen> createState() => _QuoteScreenState();
}

class _QuoteScreenState extends State<QuoteScreen> {
  final nameCtrl = TextEditingController();
  final phoneCtrl = TextEditingController();
  final sumCtrl = TextEditingController(text: '250000');
  final ageCtrl = TextEditingController(text: '32');
  String? productId;
  String frequency = 'weekly';
  LocalQuote? last;

  @override
  void dispose() {
    nameCtrl.dispose();
    phoneCtrl.dispose();
    sumCtrl.dispose();
    ageCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<OfflineStore>();
    productId ??= store.products.first.id;
    final product = store.products.firstWhere((p) => p.id == productId);

    return Scaffold(
      appBar: AppBar(title: const Text('Quote')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SoftCard(
            child: Column(
              children: [
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Participant name')),
                const SizedBox(height: 8),
                TextField(controller: phoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: productId,
                  items: store.products
                      .map((p) => DropdownMenuItem(value: p.id, child: Text(p.name)))
                      .toList(),
                  onChanged: (v) {
                    setState(() {
                      productId = v;
                      final p = store.products.firstWhere((e) => e.id == v);
                      frequency = p.frequencies.first;
                      if (p.ratingBasis == 'flat') sumCtrl.text = p.maxSumCovered.toStringAsFixed(0);
                    });
                  },
                  decoration: const InputDecoration(labelText: 'Product'),
                ),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: frequency,
                  items: product.frequencies
                      .map((f) => DropdownMenuItem(value: f, child: Text(f)))
                      .toList(),
                  onChanged: (v) => setState(() => frequency = v ?? frequency),
                  decoration: const InputDecoration(labelText: 'Frequency'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: sumCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Sum covered (KES)'),
                ),
                const SizedBox(height: 8),
                TextField(
                  controller: ageCtrl,
                  keyboardType: TextInputType.number,
                  decoration: const InputDecoration(labelText: 'Age / vehicle age'),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () async {
                      final sum = double.tryParse(sumCtrl.text) ?? product.minContribution;
                      final age = int.tryParse(ageCtrl.text);
                      final q = await store.createQuote(
                        participantName: nameCtrl.text.trim().isEmpty ? 'Walk-in' : nameCtrl.text.trim(),
                        phone: phoneCtrl.text.trim().isEmpty ? '+254700000000' : phoneCtrl.text.trim(),
                        product: product,
                        sumCovered: sum,
                        frequency: frequency,
                        age: product.line == 'medical' || product.line == 'family_takaful' ? age : null,
                        vehicleAge: product.line == 'motor' ? age : null,
                      );
                      setState(() => last = q);
                    },
                    child: const Text('Price offline'),
                  ),
                ),
              ],
            ),
          ),
          if (last != null) ...[
            const SizedBox(height: 12),
            SoftCard(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(last!.productName, style: const TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
                  const SizedBox(height: 8),
                  _kv('Contribution', kes.format(last!.base)),
                  _kv('Wakala', kes.format(last!.wakala)),
                  _kv('Tabarru', kes.format(last!.tabarru)),
                  _kv('Levies', kes.format(last!.levies)),
                  _kv('Total due', kes.format(last!.total)),
                  _kv('UW', last!.uwDecision),
                  const SizedBox(height: 4),
                  Text(
                    last!.synced ? 'Synced' : 'Queued for sync',
                    style: TextStyle(color: last!.synced ? TaminColors.teal : TaminColors.gold, fontSize: 12),
                  ),
                ],
              ),
            ),
          ],
          const SizedBox(height: 12),
          const Text('Recent quotes', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
          const SizedBox(height: 8),
          ...store.quotes.take(8).map(
                (q) => Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: SoftCard(
                    child: Row(
                      children: [
                        Expanded(
                          child: Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              Text(q.participantName, style: const TextStyle(fontWeight: FontWeight.w600)),
                              Text('${q.productName} · ${kes.format(q.total)}', style: const TextStyle(fontSize: 12, color: TaminColors.mute)),
                            ],
                          ),
                        ),
                        Icon(q.synced ? Icons.cloud_done : Icons.cloud_off, color: q.synced ? TaminColors.teal : TaminColors.gold, size: 18),
                      ],
                    ),
                  ),
                ),
              ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(k, style: const TextStyle(color: TaminColors.mute)),
          Text(v, style: const TextStyle(fontWeight: FontWeight.w600)),
        ],
      ),
    );
  }
}

class CollectScreen extends StatefulWidget {
  const CollectScreen({super.key});

  @override
  State<CollectScreen> createState() => _CollectScreenState();
}

class _CollectScreenState extends State<CollectScreen> {
  final nameCtrl = TextEditingController();
  final phoneCtrl = TextEditingController(text: '2547');
  final amountCtrl = TextEditingController(text: '200');
  String method = 'mpesa_stk';

  @override
  void dispose() {
    nameCtrl.dispose();
    phoneCtrl.dispose();
    amountCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<OfflineStore>();

    return Scaffold(
      appBar: AppBar(title: const Text('Collect')),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SoftCard(
            child: Column(
              children: [
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Participant')),
                const SizedBox(height: 8),
                TextField(controller: phoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'M-Pesa number')),
                const SizedBox(height: 8),
                TextField(controller: amountCtrl, keyboardType: TextInputType.number, decoration: const InputDecoration(labelText: 'Amount (KES)')),
                const SizedBox(height: 8),
                DropdownButtonFormField<String>(
                  value: method,
                  items: const [
                    DropdownMenuItem(value: 'mpesa_stk', child: Text('M-Pesa STK')),
                    DropdownMenuItem(value: 'cash', child: Text('Cash (receipt later)')),
                    DropdownMenuItem(value: 'ussd', child: Text('USSD payment')),
                  ],
                  onChanged: (v) => setState(() => method = v ?? method),
                  decoration: const InputDecoration(labelText: 'Method'),
                ),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton.icon(
                    onPressed: () async {
                      final amount = double.tryParse(amountCtrl.text) ?? 0;
                      if (amount <= 0) return;
                      final c = await store.collect(
                        participantName: nameCtrl.text.trim().isEmpty ? 'Participant' : nameCtrl.text.trim(),
                        phone: phoneCtrl.text.trim(),
                        amount: amount,
                        method: method,
                      );
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        SnackBar(
                          content: Text(
                            method == 'mpesa_stk'
                                ? 'STK queued ${c.reference}. Sync when online.'
                                : 'Collection saved offline.',
                          ),
                        ),
                      );
                    },
                    icon: const Icon(Icons.send_to_mobile),
                    label: const Text('Record collection'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 16),
          const Text('Collections', style: TextStyle(fontWeight: FontWeight.w600, fontSize: 16)),
          const SizedBox(height: 8),
          ...store.collections.map(
            (c) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SoftCard(
                child: Row(
                  children: [
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('${kes.format(c.amount)} · ${c.method}', style: const TextStyle(fontWeight: FontWeight.w600)),
                          Text('${c.participantName} · ${c.phone}', style: const TextStyle(fontSize: 12, color: TaminColors.mute)),
                          if (c.reference != null) Text(c.reference!, style: const TextStyle(fontSize: 11, color: TaminColors.mute)),
                        ],
                      ),
                    ),
                    Icon(c.synced ? Icons.cloud_done : Icons.cloud_off, color: c.synced ? TaminColors.teal : TaminColors.gold),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}

class ClaimScreen extends StatefulWidget {
  const ClaimScreen({super.key});

  @override
  State<ClaimScreen> createState() => _ClaimScreenState();
}

class _ClaimScreenState extends State<ClaimScreen> {
  final policyCtrl = TextEditingController();
  final nameCtrl = TextEditingController();
  final phoneCtrl = TextEditingController();
  final descCtrl = TextEditingController();

  @override
  void dispose() {
    policyCtrl.dispose();
    nameCtrl.dispose();
    phoneCtrl.dispose();
    descCtrl.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final store = context.watch<OfflineStore>();

    // Repurpose 5th tab as Sync + FNOL combined for field use
    return Scaffold(
      appBar: AppBar(
        title: const Text('Claims & sync'),
        actions: [
          IconButton(
            tooltip: 'Sync queue',
            onPressed: store.syncing ? null : () => store.syncNow(),
            icon: const Icon(Icons.cloud_sync),
          ),
        ],
      ),
      body: ListView(
        padding: const EdgeInsets.all(16),
        children: [
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Icon(store.online ? Icons.wifi : Icons.wifi_off, color: store.online ? TaminColors.teal : TaminColors.gold),
                    const SizedBox(width: 8),
                    Text(store.online ? 'Online' : 'Offline — queue only', style: const TextStyle(fontWeight: FontWeight.w600)),
                    const Spacer(),
                    Text('${store.pendingCount} pending', style: const TextStyle(color: TaminColors.mute)),
                  ],
                ),
                const SizedBox(height: 8),
                ...store.queue.take(6).map(
                      (q) => Padding(
                        padding: const EdgeInsets.symmetric(vertical: 2),
                        child: Text('${q.entity} ${q.payloadId} · ${q.status.name}', style: const TextStyle(fontSize: 12, color: TaminColors.mute)),
                      ),
                    ),
                if (store.queue.isEmpty) const Text('Sync queue empty', style: TextStyle(color: TaminColors.mute, fontSize: 12)),
              ],
            ),
          ),
          const SizedBox(height: 12),
          SoftCard(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('FNOL (offline)', style: TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                const SizedBox(height: 8),
                TextField(controller: policyCtrl, decoration: const InputDecoration(labelText: 'Policy / certificate hint')),
                const SizedBox(height: 8),
                TextField(controller: nameCtrl, decoration: const InputDecoration(labelText: 'Participant')),
                const SizedBox(height: 8),
                TextField(controller: phoneCtrl, keyboardType: TextInputType.phone, decoration: const InputDecoration(labelText: 'Phone')),
                const SizedBox(height: 8),
                TextField(controller: descCtrl, maxLines: 3, decoration: const InputDecoration(labelText: 'Loss description')),
                const SizedBox(height: 12),
                SizedBox(
                  width: double.infinity,
                  child: FilledButton(
                    onPressed: () async {
                      if (descCtrl.text.trim().isEmpty) return;
                      await store.fileClaim(
                        policyHint: policyCtrl.text.trim().isEmpty ? 'Unknown' : policyCtrl.text.trim(),
                        participantName: nameCtrl.text.trim().isEmpty ? 'Participant' : nameCtrl.text.trim(),
                        phone: phoneCtrl.text.trim(),
                        description: descCtrl.text.trim(),
                        lossDate: DateTime.now(),
                      );
                      descCtrl.clear();
                      if (!context.mounted) return;
                      ScaffoldMessenger.of(context).showSnackBar(
                        const SnackBar(content: Text('Claim intake saved. Will sync when online.')),
                      );
                    },
                    child: const Text('Submit FNOL'),
                  ),
                ),
              ],
            ),
          ),
          const SizedBox(height: 12),
          ...store.claims.map(
            (c) => Padding(
              padding: const EdgeInsets.only(bottom: 8),
              child: SoftCard(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(c.policyHint, style: const TextStyle(fontWeight: FontWeight.w600)),
                    Text(c.description, style: const TextStyle(fontSize: 13)),
                    const SizedBox(height: 4),
                    Text(
                      c.synced ? 'Synced' : 'Queued',
                      style: TextStyle(fontSize: 12, color: c.synced ? TaminColors.teal : TaminColors.gold),
                    ),
                  ],
                ),
              ),
            ),
          ),
        ],
      ),
    );
  }
}
