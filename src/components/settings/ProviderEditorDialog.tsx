import ProfileEditor, { type ProfileEditorProps } from '../ProfileEditor';

export default function ProviderEditorDialog(props: ProfileEditorProps) {
  const title = props.profileType === 'transcription' ? '转写服务编辑器' : 'AI 服务编辑器';
  return <section className="provider-editor-dialog" role="dialog" aria-modal="false" aria-label={title}>
    <ProfileEditor {...props} />
  </section>;
}
