"""
Field arguments the model modules share.
--------------------------------------------------------------------------------
`backend.chat_app.models.field_args`

"""
# An optional field: null in the database, and blank allowed in forms
init_args = dict(null=True, blank=True)
