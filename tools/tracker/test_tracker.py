import tempfile
import unittest
from pathlib import Path
import server

class TrackerTests(unittest.TestCase):
    def test_status_scope(self):
        self.assertEqual(server.classify('Source delivered; browser proof pending'), 'qa')
        self.assertEqual(server.classify('Implementation pending'), 'build')
        self.assertEqual(server.classify('Blocked by provider approval'), 'blocked')
        self.assertEqual(server.classify('The form blocks invalid dates'), 'review')
        self.assertEqual(server.classify('Screenshot checked after waiting for the animation'), 'review')
        self.assertEqual(server.classify('Not blocked by provider approval'), 'review')
        self.assertEqual(server.classify('Focused tests passed; runtime remains unverified'), 'qa')
        self.assertEqual(server.classify('Complete local slice; no full acceptance claimed'), 'review')
    def test_only_work_tables(self):
        text = '# A\n\n## Field rules\n\n| Field | Validation |\n| --- | --- |\n| X | blocks invalid dates |\n\n## Checkpoint\n\nSource-only implementation; browser unverified.'
        items = server.extract(text)
        self.assertEqual(len(items), 1)
        self.assertEqual(items[0]['status'], 'qa')
    def test_checkpoint_supersedes_old_planning_run(self):
        text = '# Plan\n\n## Implementation checkpoint\n\nImplemented; browser unverified.\n\n## Last run\n\nImplementation pending.'
        self.assertEqual([i['status'] for i in server.extract(text)], ['qa'])
    def test_gap_inventory(self):
        text = '# Plan\n\n## Work matrix\n\n| ID | Current evidence | Important gap |\n| --- | --- | --- |\n| W01 | Source added, runtime pending | Add missing history |\n| W02 | Source delivered | Verify reload |'
        self.assertEqual([i['status'] for i in server.extract(text)], ['build','qa','qa'])
    def test_discovery(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            (root/server.TRACKER).parent.mkdir(parents=True)
            (root/server.PLAN_DIR).mkdir(parents=True)
            (root/server.PLAN_DIR/'new-plan.md').write_text('# New')
            (root/server.PLAN_DIR/'README.md').write_text('# Index')
            (root/server.TRACKER).write_text('[missing](../../docs/development/missing.md) [outside](../../../../outside.md)')
            paths, missing=server.discover(root)
            self.assertEqual(paths, [server.PLAN_DIR/'new-plan.md'])
            self.assertEqual(missing, ['docs/development/missing.md'])
    def test_milestone_scores_and_optional_scope(self):
        text = '\n'.join(f'| MC-{i:02} — Area {i} | {20 if i == 16 else 80}% | 40% | 0% | Gap | Next | Evidence |' for i in range(1,17))
        rows = server.milestones(text)
        self.assertEqual(len(rows), 16)
        core = [row for row in rows if row['id'] != 'MC-16']
        self.assertEqual(sum(row['build'] for row in core)/len(core), 80)
        self.assertEqual(rows[-1]['build'], 20)
        for invalid in [text.replace('80%', '101%', 1), text.replace('80%', 'unknown', 1), text.split('\n', 1)[1], text+'\n'+text.splitlines()[0]]:
            with self.assertRaises(ValueError): server.milestones(invalid)
    def test_original_relationships_are_preserved(self):
        rows=server.relationship_map()
        self.assertEqual(len(rows),6)
        self.assertEqual(rows[0]['milestones'],['MC-03','MC-05','MC-06','MC-08','MC-10','MC-12'])
        self.assertEqual(rows[1]['milestones'],['MC-05','MC-10','MC-12'])
        self.assertTrue(all((server.ROOT/row['plan']).is_file() for row in rows))
    def test_snapshot(self):
        data=server.snapshot()
        self.assertGreater(len(data['plans']), 5)
        self.assertTrue(data['history'])
        self.assertEqual(len(data['overview']['milestones']),16)
        self.assertIsNone(data['overview']['error'])
        self.assertTrue(all(p['items'] for p in data['plans']))
        self.assertEqual(len({p['id'] for p in data['plans']}),len(data['plans']))

if __name__=='__main__':unittest.main()
