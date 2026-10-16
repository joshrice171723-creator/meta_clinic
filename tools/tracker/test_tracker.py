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
    def test_snapshot(self):
        data=server.snapshot()
        self.assertGreater(len(data['plans']), 5)
        self.assertTrue(data['history'])
        self.assertTrue(all(p['items'] for p in data['plans']))
        self.assertEqual(len({p['id'] for p in data['plans']}),len(data['plans']))

if __name__=='__main__':unittest.main()
