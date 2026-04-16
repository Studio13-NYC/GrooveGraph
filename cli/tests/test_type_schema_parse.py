from __future__ import annotations

from groovegraph.typedb_verify import list_types_from_type_schema_define


def test_list_types_from_define_extracts_entity_relation_attribute() -> None:
    text = """
define
  entity person, owns name;
  relation friendship, relates friend;
  attribute name, value string;
"""
    names = list_types_from_type_schema_define(text)
    assert names == ["friendship", "name", "person"]
