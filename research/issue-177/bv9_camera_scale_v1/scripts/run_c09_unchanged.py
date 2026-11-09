#!/usr/bin/env python3
"""Run the correction study's c09_measure.py UNCHANGED (runpy) on the bv9 baseline geometry only. usage: run_c09_unchanged.py <tag>
Output: data/c09_measure_<tag>.json (redirected by compat.py)."""
import sys, os, runpy
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import compat as X
os.environ['ONLY'] = 'baseline'
sys.argv = ['c09_measure.py', sys.argv[1]]
runpy.run_path(X.COR + 'scripts/c09_measure.py', run_name='__main__')
